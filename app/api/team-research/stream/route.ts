import { NextRequest } from "next/server";
import {
  listAgents,
  getAgentApiKey,
  createResearchSession,
  appendResearchMessage,
  completeResearchSession,
  ResearchMessage,
} from "@/lib/agents-store";
import crypto from "crypto";

interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function callLLM(
  provider: string,
  model: string,
  apiKey: string,
  baseUrl: string | undefined,
  messages: LLMMessage[]
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  if (provider === "anthropic") {
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemMsg?.content,
        messages: userMsgs,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.content?.[0]?.text ?? "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  if (provider === "openrouter") {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://openclaw-team-dashboard",
        "X-Title": "OpenClaw Team Dashboard",
      },
      body: JSON.stringify({ model, messages, max_tokens: 2048 }),
    });
    if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  if (provider === "openai" || provider === "custom") {
    const url = baseUrl ? `${baseUrl}/chat/completions` : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: 2048 }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        contents: userMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  if (provider === "ollama") {
    const url = baseUrl ? `${baseUrl}/api/chat` : "http://localhost:11434/api/chat";
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.message?.content ?? "",
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function sseEvent(encoder: TextEncoder, event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { question, agentIds, dataSource, mcpEndpoint, dbConnectionString } = body as {
    question: string;
    agentIds: string[];
    dataSource?: string;
    mcpEndpoint?: string;
    dbConnectionString?: string;
  };

  if (!question || !agentIds?.length) {
    return new Response(JSON.stringify({ error: "Missing question or agentIds" }), { status: 400 });
  }

  const allAgents = listAgents();
  const selectedAgents = allAgents.filter((a) => agentIds.includes(a.id) && a.active);
  if (!selectedAgents.length) {
    return new Response(JSON.stringify({ error: "No active agents found" }), { status: 400 });
  }

  // Fetch extra context from data source before streaming
  let dataSourceContext = "";
  if (dataSource === "mcp" && mcpEndpoint) {
    try {
      const mcpRes = await fetch(mcpEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: question }),
        signal: AbortSignal.timeout(8000),
      });
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json();
        const mcpText = typeof mcpData === "string"
          ? mcpData
          : JSON.stringify(mcpData).slice(0, 4000);
        dataSourceContext = `\n\n[MCP Context from ${mcpEndpoint}]:\n${mcpText}`;
      }
    } catch {
      dataSourceContext = `\n\n[MCP endpoint ${mcpEndpoint} did not respond — proceeding without context]`;
    }
  } else if (dataSource === "database" && dbConnectionString) {
    // Parse connection info for display — actual DB query requires server-side driver
    // Provide connection info as context note so agents are aware of the data source
    const safeConn = dbConnectionString.replace(/:[^:@]+@/, ":***@");
    dataSourceContext = `\n\n[Database Context]: Connection configured at ${safeConn}. You may reference schemas or data you know about this database type when relevant to the question.`;
  }

  const session = createResearchSession({ question, agentIds, dataSource });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(sseEvent(encoder, event, data));
      };

      send("session", { sessionId: session.id });
      send("status", { message: `Starting research with ${selectedAgents.length} agents...` });

      const agentFindings: { agentId: string; name: string; emoji: string; role: string; content: string }[] = [];
      const agentTokens: Record<string, { input: number; output: number }> = {};

      // Phase 1: Each agent independently researches the question
      for (const agent of selectedAgents) {
        send("agent_start", { agentId: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role });

        try {
          const apiKey = getAgentApiKey(agent.id);
          if (!apiKey) {
            send("agent_error", { agentId: agent.id, error: "No API key configured" });
            continue;
          }

          const thinkingMsg: ResearchMessage = {
            id: crypto.randomUUID(),
            agentId: agent.id,
            agentName: agent.name,
            agentEmoji: agent.emoji,
            role: "thinking",
            content: `กำลังวิเคราะห์คำถาม: "${question}"`,
            tokensUsed: 0,
            timestamp: new Date().toISOString(),
          };
          appendResearchMessage(session.id, thinkingMsg);
          send("message", thinkingMsg);

          const result = await callLLM(agent.provider, agent.model, apiKey, agent.baseUrl, [
            {
              role: "system",
              content: agent.soul + dataSourceContext,
            },
            {
              role: "user",
              content: `คำถาม: ${question}\n\nกรุณาวิเคราะห์และให้ข้อมูล/ความเห็นตามบทบาทของคุณ (${agent.role}) อย่างละเอียดและมีเหตุผล`,
            },
          ]);

          agentTokens[agent.id] = { input: result.inputTokens, output: result.outputTokens };

          const findingMsg: ResearchMessage = {
            id: crypto.randomUUID(),
            agentId: agent.id,
            agentName: agent.name,
            agentEmoji: agent.emoji,
            role: "finding",
            content: result.content,
            tokensUsed: result.inputTokens + result.outputTokens,
            timestamp: new Date().toISOString(),
          };
          appendResearchMessage(session.id, findingMsg);
          send("message", findingMsg);
          send("agent_tokens", {
            agentId: agent.id,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.inputTokens + result.outputTokens,
          });

          agentFindings.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            content: result.content,
          });
        } catch (err) {
          send("agent_error", { agentId: agent.id, error: String(err) });
        }
      }

      // Phase 2: Agents discuss each other's findings (cross-analysis)
      // Assign alternating debate positions so agents are forced to argue different sides
      if (agentFindings.length > 1) {
        send("status", { message: "Agents are discussing findings..." });

        // Split agents into two camps: even index = "ฝ่ายสนับสนุน", odd index = "ฝ่ายคัดค้าน"
        const debatePositions = selectedAgents.map((_, i) =>
          i % 2 === 0
            ? { label: "ฝ่ายสนับสนุน", stance: "คุณต้องยืนหยัดโต้แย้งว่า **ความเห็นของ agents อื่นผิดหรือไม่ครบ** อย่างน้อย 2 ประเด็น โดยใช้หลักฐานและเหตุผลที่แข็งแกร่งจากมุมมองของ role คุณ ห้ามเห็นด้วยกับใครโดยไม่ท้าทายก่อน" }
            : { label: "ฝ่ายคัดค้าน", stance: "คุณต้องหาจุดอ่อนและโจมตีความเห็นของ agents อื่นอย่างน้อย 2 ประเด็น ชี้ให้เห็นว่าพวกเขามองข้ามอะไร หรือสรุปผิดตรงไหน แล้วเสนอมุมมองที่แตกต่างออกไปจาก role ของคุณ" }
        );

        for (let i = 0; i < selectedAgents.length; i++) {
          const agent = selectedAgents[i];
          const position = debatePositions[i];
          const apiKey = getAgentApiKey(agent.id);
          if (!apiKey) continue;

          const otherFindings = agentFindings
            .filter((f) => f.agentId !== agent.id)
            .map((f) => `[${f.emoji} ${f.name} - ${f.role}]:\n${f.content}`)
            .join("\n\n---\n\n");

          const myFinding = agentFindings.find((f) => f.agentId === agent.id);
          if (!myFinding) continue;

          try {
            const result = await callLLM(agent.provider, agent.model, apiKey, agent.baseUrl, [
              {
                role: "system",
                content: `${agent.soul}\n\n**บทบาทในการดีเบตครั้งนี้: ${position.label}**\n${position.stance}`,
              },
              {
                role: "user",
                content: `คำถาม: ${question}\n\nความเห็นของคุณ (Phase 1):\n${myFinding.content}\n\n---\nความเห็นของ agents อื่นที่คุณต้องโต้แย้ง:\n${otherFindings}\n\n---\n**คำสั่ง:** ${position.stance}\n\nเริ่มต้นด้วยการระบุชัดเจนว่าคุณ **ไม่เห็นด้วย** กับใครในประเด็นใด แล้วอธิบายว่าทำไมพวกเขาถึงผิดหรือมองไม่ครบ ใช้ภาษาตรงไปตรงมา ไม่ต้องสุภาพเกินไป`,
              },
            ]);

            const tokens = agentTokens[agent.id] ?? { input: 0, output: 0 };
            agentTokens[agent.id] = {
              input: tokens.input + result.inputTokens,
              output: tokens.output + result.outputTokens,
            };

            const chatMsg: ResearchMessage = {
              id: crypto.randomUUID(),
              agentId: agent.id,
              agentName: agent.name,
              agentEmoji: agent.emoji,
              role: "chat",
              content: result.content,
              tokensUsed: result.inputTokens + result.outputTokens,
              timestamp: new Date().toISOString(),
            };
            appendResearchMessage(session.id, chatMsg);
            send("message", chatMsg);
            send("agent_tokens", {
              agentId: agent.id,
              inputTokens: agentTokens[agent.id].input,
              outputTokens: agentTokens[agent.id].output,
              totalTokens: agentTokens[agent.id].input + agentTokens[agent.id].output,
            });
          } catch (err) {
            send("agent_error", { agentId: agent.id, error: String(err) });
          }
        }
      }

      // Phase 3: Synthesizer (last agent or first agent) generates final answer
      send("status", { message: "Synthesizing final answer..." });

      const synthAgent = selectedAgents[selectedAgents.length - 1];
      const synthApiKey = getAgentApiKey(synthAgent.id);

      if (synthApiKey && agentFindings.length > 0) {
        try {
          const allContext = agentFindings
            .map((f) => `[${f.emoji} ${f.name} - ${f.role}]:\n${f.content}`)
            .join("\n\n---\n\n");

          const result = await callLLM(synthAgent.provider, synthAgent.model, synthApiKey, synthAgent.baseUrl, [
            {
              role: "system",
              content:
                "คุณคือผู้สรุปผล กรุณาสรุปคำตอบที่ดีที่สุดจากข้อมูลทั้งหมดที่ agents ได้วิเคราะห์และถกเถียงกันมา โดยให้ระบุ: (1) ประเด็นที่ทุกคนเห็นพ้องกัน (2) ประเด็นที่ยังมีความเห็นต่าง และเหตุผลของแต่ละฝ่าย (3) ข้อสรุปสุดท้ายที่ดีที่สุดพร้อมเหตุผล",
            },
            {
              role: "user",
              content: `คำถาม: ${question}\n\nข้อมูลจากทีม agents:\n\n${allContext}\n\nกรุณาสรุปคำตอบสุดท้ายที่ดีที่สุดสำหรับคำถามนี้`,
            },
          ]);

          const synthMsg: ResearchMessage = {
            id: crypto.randomUUID(),
            agentId: synthAgent.id,
            agentName: synthAgent.name,
            agentEmoji: synthAgent.emoji,
            role: "synthesis",
            content: result.content,
            tokensUsed: result.inputTokens + result.outputTokens,
            timestamp: new Date().toISOString(),
          };
          appendResearchMessage(session.id, synthMsg);
          send("message", synthMsg);
          send("final_answer", { content: result.content });
          completeResearchSession(session.id, result.content, "completed");
        } catch (err) {
          completeResearchSession(session.id, String(err), "error");
          send("error", { message: String(err) });
        }
      } else {
        completeResearchSession(session.id, agentFindings[0]?.content ?? "", "completed");
        send("final_answer", { content: agentFindings[0]?.content ?? "" });
      }

      send("done", { sessionId: session.id });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
