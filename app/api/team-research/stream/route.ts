import { NextRequest } from "next/server";
import {
  listAgents,
  getAgentApiKey,
  getSettings,
  createResearchSession,
  appendResearchMessage,
  completeResearchSession,
  ResearchMessage,
  AgentPublic,
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

// Fetch MCP tools and call relevant ones for context
async function fetchMcpContext(mcpEndpoint: string, mcpAccessMode: string, question: string): Promise<string> {
  try {
    // Get available tools
    const toolsRes = await fetch(`${mcpEndpoint}/tools`, {
      headers: { "mcp-access-mode": mcpAccessMode },
      signal: AbortSignal.timeout(6000),
    });
    if (!toolsRes.ok) return "";
    const toolsData = await toolsRes.json();
    const tools: { name: string; description?: string }[] = Array.isArray(toolsData) ? toolsData : (toolsData.tools ?? []);
    if (tools.length === 0) return "";

    // Pick up to 3 relevant tools (by name/description keyword match against question)
    const q = question.toLowerCase();
    const keywords = q.split(/\s+/).filter((w) => w.length > 3);
    const scored = tools.map((t) => {
      const text = `${t.name} ${t.description ?? ""}`.toLowerCase();
      const score = keywords.filter((k) => text.includes(k)).length;
      return { ...t, score };
    }).sort((a, b) => b.score - a.score).slice(0, 3);

    const results: string[] = [];
    for (const tool of scored) {
      try {
        const callRes = await fetch(`${mcpEndpoint}/call`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "mcp-access-mode": mcpAccessMode,
          },
          body: JSON.stringify({ name: tool.name, arguments: { query: question } }),
          signal: AbortSignal.timeout(8000),
        });
        if (!callRes.ok) continue;
        const callData = await callRes.json();
        const text = typeof callData === "string" ? callData : JSON.stringify(callData);
        if (text && text.length > 10) {
          results.push(`[MCP:${tool.name}]\n${text.slice(0, 1500)}`);
        }
      } catch { /* skip failed tool */ }
    }

    return results.length > 0 ? `\n\n---\n🔌 ข้อมูลจาก MCP Server (${mcpEndpoint}):\n${results.join("\n\n")}\n---\n` : "";
  } catch {
    return "";
  }
}

// Web search via Serper → SerpApi fallback
async function webSearch(query: string, serperKey?: string, serpApiKey?: string): Promise<string> {
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "content-type": "application/json" },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.organic ?? []).slice(0, 5).map((r: { title: string; link: string; snippet: string }, i: number) =>
          `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`
        );
        return results.join("\n\n");
      }
    } catch { /* fall through */ }
  }

  if (serpApiKey) {
    try {
      const params = new URLSearchParams({ q: query, api_key: serpApiKey, engine: "google", num: "5" });
      const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        const results = (data.organic_results ?? []).slice(0, 5).map((r: { title: string; link: string; snippet: string }, i: number) =>
          `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`
        );
        return results.join("\n\n");
      }
    } catch { /* ignore */ }
  }

  return "";
}

// Detect chairman from role seniority
const CHAIRMAN_ROLES = ["ceo", "chief executive", "president", "md", "managing director", "chairman", "director", "vp", "vice president", "cfo", "coo", "cto", "cmo", "chro"];

function detectChairman(agents: AgentPublic[]): AgentPublic {
  // Use explicit seniority if set
  const sorted = [...agents].sort((a, b) => {
    const sa = a.seniority ?? 99;
    const sb = b.seniority ?? 99;
    if (sa !== sb) return sa - sb;
    // Fall back to role keyword matching
    const ra = a.role.toLowerCase();
    const rb = b.role.toLowerCase();
    const ia = CHAIRMAN_ROLES.findIndex((k) => ra.includes(k));
    const ib = CHAIRMAN_ROLES.findIndex((k) => rb.includes(k));
    const scoreA = ia === -1 ? 999 : ia;
    const scoreB = ib === -1 ? 999 : ib;
    return scoreA - scoreB;
  });
  return sorted[0];
}

// Sort agents by speaking order (chairman first and last, others by seniority)
function sortBySeniority(agents: AgentPublic[], chairman: AgentPublic): AgentPublic[] {
  const others = agents
    .filter((a) => a.id !== chairman.id)
    .sort((a, b) => {
      const sa = a.seniority ?? 50;
      const sb = b.seniority ?? 50;
      if (sa !== sb) return sa - sb;
      const ra = a.role.toLowerCase();
      const rb = b.role.toLowerCase();
      const ia = CHAIRMAN_ROLES.findIndex((k) => ra.includes(k));
      const ib = CHAIRMAN_ROLES.findIndex((k) => rb.includes(k));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  return [chairman, ...others];
}

function sseEvent(encoder: TextEncoder, event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

interface ConversationTurn {
  question: string;
  answer: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    question,
    agentIds,
    dataSource,
    mcpEndpoint,
    dbConnectionString,
    conversationHistory,
    fileContexts,
    historyMode = "full", // "full" | "summary" | "last3" | "none"
  } = body as {
    question: string;
    agentIds: string[];
    dataSource?: string;
    mcpEndpoint?: string;
    dbConnectionString?: string;
    conversationHistory?: ConversationTurn[];
    fileContexts?: { filename: string; meta: string; context: string; sheets?: string[] }[];
    historyMode?: "full" | "summary" | "last3" | "none";
  };

  if (!question || !agentIds?.length) {
    return new Response(JSON.stringify({ error: "Missing question or agentIds" }), { status: 400 });
  }

  const allAgents = listAgents();
  const selectedAgents = allAgents.filter((a) => agentIds.includes(a.id) && a.active);
  if (!selectedAgents.length) {
    return new Response(JSON.stringify({ error: "No active agents found" }), { status: 400 });
  }

  // Load web search keys from settings
  const settings = getSettings();
  const serperKey = settings.serperApiKey;
  const serpApiKeyVal = settings.serpApiKey;

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
        const mcpText = typeof mcpData === "string" ? mcpData : JSON.stringify(mcpData).slice(0, 4000);
        dataSourceContext = `\n\n[MCP Context from ${mcpEndpoint}]:\n${mcpText}`;
      }
    } catch {
      dataSourceContext = `\n\n[MCP endpoint ${mcpEndpoint} did not respond — proceeding without context]`;
    }
  } else if (dataSource === "database" && dbConnectionString) {
    const safeConn = dbConnectionString.replace(/:[^:@]+@/, ":***@");
    dataSourceContext = `\n\n[Database Context]: Connection configured at ${safeConn}.`;
  }

  // Build history context based on historyMode
  function buildHistoryContext(history?: ConversationTurn[]): string {
    if (!history || history.length === 0) return "";
    let turns = history;
    if (historyMode === "none") return "";
    if (historyMode === "last3") turns = history.slice(-3);
    if (historyMode === "summary") {
      // Summarize: just questions + first 200 chars of answers
      return `\n\n---\nสรุปประวัติการประชุมก่อนหน้า:\n${turns.map((t, i) => `[วาระที่ ${i + 1}] ${t.question}\nสรุป: ${t.answer.slice(0, 200)}...`).join("\n\n")}\n---\n`;
    }
    return `\n\n---\nประวัติการประชุมก่อนหน้า:\n${turns.map((t, i) => `[วาระที่ ${i + 1}] คำถาม: ${t.question}\nสรุปมติ: ${t.answer}`).join("\n\n")}\n---\n`;
  }

  // Build file context (with optional sheet filter)
  function buildFileContext(contexts?: { filename: string; meta: string; context: string; sheets?: string[] }[]): string {
    if (!contexts || contexts.length === 0) return "";
    return `\n\n---\n📎 เอกสารอ้างอิงที่แนบมา (ใช้ข้อมูลเหล่านี้ประกอบการวิเคราะห์):\n${contexts.map((f) => `[${f.meta}]\n${f.context}`).join("\n\n---\n")}\n---\n`;
  }

  const session = createResearchSession({ question, agentIds, dataSource });

  // Detect chairman
  const chairman = detectChairman(selectedAgents);
  const orderedAgents = sortBySeniority(selectedAgents, chairman);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(sseEvent(encoder, event, data));
      };

      send("session", { sessionId: session.id });
      send("chairman", { agentId: chairman.id, name: chairman.name, emoji: chairman.emoji, role: chairman.role });
      send("status", { message: `🏛️ ประธาน: ${chairman.emoji} ${chairman.name} (${chairman.role}) — เปิดการประชุม` });

      const agentFindings: { agentId: string; name: string; emoji: string; role: string; content: string; searchResults?: string }[] = [];
      const agentTokens: Record<string, { input: number; output: number }> = {};

      const historyContext = buildHistoryContext(conversationHistory);
      const fileContext = buildFileContext(fileContexts);

      // Chairman opens the meeting
      {
        const apiKey = getAgentApiKey(chairman.id);
        if (apiKey) {
          try {
            const openingResult = await callLLM(chairman.provider, chairman.model, apiKey, chairman.baseUrl, [
              {
                role: "system",
                content: `${chairman.soul}${dataSourceContext}${historyContext}${fileContext}\n\nคุณเป็นประธานการประชุม มีหน้าที่เปิดประชุม กำหนดวาระ และนำทีมหาข้อสรุป`,
              },
              {
                role: "user",
                content: `กรุณาเปิดการประชุมสำหรับวาระ: "${question}"\n\nชี้แจงวัตถุประสงค์และกำหนดประเด็นหลักที่ต้องการหาคำตอบ (2-3 ประเด็น) เพื่อให้ทีมงานวิเคราะห์ในทิศทางเดียวกัน`,
              },
            ]);

            const openingMsg: ResearchMessage = {
              id: crypto.randomUUID(),
              agentId: chairman.id,
              agentName: chairman.name,
              agentEmoji: chairman.emoji,
              role: "thinking",
              content: `🏛️ **เปิดการประชุม**\n\n${openingResult.content}`,
              tokensUsed: openingResult.inputTokens + openingResult.outputTokens,
              timestamp: new Date().toISOString(),
            };
            appendResearchMessage(session.id, openingMsg);
            send("message", openingMsg);
            agentTokens[chairman.id] = { input: openingResult.inputTokens, output: openingResult.outputTokens };
          } catch { /* skip opening if error */ }
        }
      }

      // Phase 1: Each agent presents their analysis (in seniority order, chairman speaks after opening)
      send("status", { message: "📋 Phase 1 — แต่ละผู้เชี่ยวชาญนำเสนอมุมมองตามบทบาท" });

      for (const agent of orderedAgents) {
        send("agent_start", { agentId: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role, isChairman: agent.id === chairman.id });

        try {
          const apiKey = getAgentApiKey(agent.id);
          if (!apiKey) {
            send("agent_error", { agentId: agent.id, error: "No API key configured" });
            continue;
          }

          // MCP context if agent has endpoint configured
          let mcpContext = "";
          if (agent.mcpEndpoint) {
            mcpContext = await fetchMcpContext(agent.mcpEndpoint, agent.mcpAccessMode ?? "general", question);
          }

          // Web search if agent has it enabled
          let searchContext = "";
          if (agent.useWebSearch && (serperKey || serpApiKeyVal)) {
            send("agent_searching", { agentId: agent.id, query: question });
            const searchResults = await webSearch(question, serperKey, serpApiKeyVal);
            if (searchResults) {
              searchContext = `\n\n🔍 ผลการค้นหาเพิ่มเติมจากอินเทอร์เน็ต:\n${searchResults}\n`;
            }
          }

          const thinkingMsg: ResearchMessage = {
            id: crypto.randomUUID(),
            agentId: agent.id,
            agentName: agent.name,
            agentEmoji: agent.emoji,
            role: "thinking",
            content: `กำลังวิเคราะห์: "${question}"${agent.useWebSearch ? " (พร้อมข้อมูลจากอินเทอร์เน็ต)" : ""}`,
            tokensUsed: 0,
            timestamp: new Date().toISOString(),
          };
          appendResearchMessage(session.id, thinkingMsg);
          send("message", thinkingMsg);

          const isChairman = agent.id === chairman.id;
          const roleInstruction = isChairman
            ? `คุณเป็นประธานการประชุม นำเสนอมุมมองจากตำแหน่ง ${agent.role} ของคุณ`
            : `นำเสนอมุมมองจากมุมมองของ ${agent.role} อย่างชัดเจนและตรงประเด็น`;

          const result = await callLLM(agent.provider, agent.model, apiKey, agent.baseUrl, [
            {
              role: "system",
              content: `${agent.soul}${dataSourceContext}${historyContext}${fileContext}${mcpContext}${searchContext}`,
            },
            {
              role: "user",
              content: `วาระการประชุม: ${question}\n\n${roleInstruction}\n\nกรุณาแสดงมุมมองและข้อมูลที่เกี่ยวข้องจากบทบาทของคุณ พร้อมระบุประเด็นสำคัญที่ควรพิจารณา${fileContexts?.length ? " โดยอ้างอิงข้อมูลจากเอกสารที่แนบมาด้วย" : ""}`,
            },
          ]);

          const prevTokens = agentTokens[agent.id] ?? { input: 0, output: 0 };
          agentTokens[agent.id] = {
            input: prevTokens.input + result.inputTokens,
            output: prevTokens.output + result.outputTokens,
          };

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
            inputTokens: agentTokens[agent.id].input,
            outputTokens: agentTokens[agent.id].output,
            totalTokens: agentTokens[agent.id].input + agentTokens[agent.id].output,
          });

          agentFindings.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            content: result.content,
            searchResults: searchContext || undefined,
          });
        } catch (err) {
          send("agent_error", { agentId: agent.id, error: String(err) });
        }
      }

      // Phase 2: Cross-discussion — agents respond to each other based on their actual soul/role
      if (agentFindings.length > 1) {
        send("status", { message: "💬 Phase 2 — อภิปรายแลกเปลี่ยนความเห็น (ตามบทบาทจริง)" });

        for (let i = 0; i < orderedAgents.length; i++) {
          const agent = orderedAgents[i];
          const apiKey = getAgentApiKey(agent.id);
          if (!apiKey) continue;

          const otherFindings = agentFindings
            .filter((f) => f.agentId !== agent.id)
            .map((f) => `[${f.emoji} ${f.name} — ${f.role}]:\n${f.content}`)
            .join("\n\n---\n\n");

          const myFinding = agentFindings.find((f) => f.agentId === agent.id);
          if (!myFinding) continue;

          try {
            const result = await callLLM(agent.provider, agent.model, apiKey, agent.baseUrl, [
              {
                role: "system",
                content: `${agent.soul}\n\nคุณกำลังอยู่ในวงอภิปราย จงแสดงความเห็นตามบทบาท ${agent.role} ของคุณอย่างตรงไปตรงมา หากเห็นด้วยให้ระบุว่าเห็นด้วยในประเด็นใด หากไม่เห็นด้วยให้ระบุชัดเจนว่าทำไมและเสนอมุมมองของคุณแทน ห้ามเออออกับทุกคนโดยไม่มีจุดยืน`,
              },
              {
                role: "user",
                content: `วาระ: ${question}\n\nความเห็นของคุณ:\n${myFinding.content}\n\n---\nความเห็นจากสมาชิกคนอื่น:\n${otherFindings}\n\n---\nในฐานะ ${agent.role} คุณมีจุดยืนอย่างไรต่อความเห็นเหล่านี้? ระบุให้ชัดเจนว่าเห็นด้วย/ไม่เห็นด้วยในประเด็นใด และเพราะอะไร`,
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

      // Phase 3: Chairman synthesizes — miti + action items + chart suggestion
      send("status", { message: "🏛️ Phase 3 — ประธานสรุปมติและ Action Items" });

      const chairApiKey = getAgentApiKey(chairman.id);

      if (chairApiKey && agentFindings.length > 0) {
        try {
          const allContext = agentFindings
            .map((f) => `[${f.emoji} ${f.name} — ${f.role}]:\n${f.content}`)
            .join("\n\n---\n\n");

          const result = await callLLM(chairman.provider, chairman.model, chairApiKey, chairman.baseUrl, [
            {
              role: "system",
              content: `คุณเป็นประธานการประชุมในบทบาท ${chairman.role} มีหน้าที่สรุปมติที่ประชุมให้ชัดเจน`,
            },
            {
              role: "user",
              content: `วาระ: ${question}\n\nความเห็นจากทีมที่ปรึกษา:\n\n${allContext}\n\n---\nกรุณาสรุปเป็นรายงานการประชุมที่มี:\n1. **ประเด็นที่ที่ประชุมเห็นพ้องกัน**\n2. **ประเด็นที่ยังมีความเห็นต่าง** (พร้อมเหตุผลแต่ละฝ่าย)\n3. **มติที่ประชุม** — ข้อสรุปที่ดีที่สุดพร้อมเหตุผล\n4. **Action Items** — สิ่งที่ต้องดำเนินการต่อ (ระบุผู้รับผิดชอบตาม role ถ้าเป็นไปได้)\n\nจากนั้นให้เพิ่มบรรทัดสุดท้ายเป็น JSON สำหรับ visualization ในรูปแบบ:\n\`\`\`chart\n{"type":"bar|line|pie|none","title":"...","labels":[...],"datasets":[{"label":"...","data":[...]}]}\n\`\`\`\nถ้าไม่มีข้อมูลตัวเลขที่เหมาะกับกราฟ ให้ใส่ type: "none"`,
            },
          ]);

          const synthMsg: ResearchMessage = {
            id: crypto.randomUUID(),
            agentId: chairman.id,
            agentName: chairman.name,
            agentEmoji: chairman.emoji,
            role: "synthesis",
            content: result.content,
            tokensUsed: result.inputTokens + result.outputTokens,
            timestamp: new Date().toISOString(),
          };
          appendResearchMessage(session.id, synthMsg);
          send("message", synthMsg);

          // Parse chart data from synthesis
          const chartMatch = result.content.match(/```chart\n([\s\S]*?)\n```/);
          if (chartMatch) {
            try {
              const chartData = JSON.parse(chartMatch[1]);
              if (chartData.type && chartData.type !== "none") {
                send("chart_data", chartData);
              }
            } catch { /* ignore chart parse error */ }
          }

          send("final_answer", { content: result.content });
          completeResearchSession(session.id, result.content, "completed");

          // Update chairman tokens
          const prevTokens = agentTokens[chairman.id] ?? { input: 0, output: 0 };
          agentTokens[chairman.id] = {
            input: prevTokens.input + result.inputTokens,
            output: prevTokens.output + result.outputTokens,
          };
          send("agent_tokens", {
            agentId: chairman.id,
            inputTokens: agentTokens[chairman.id].input,
            outputTokens: agentTokens[chairman.id].output,
            totalTokens: agentTokens[chairman.id].input + agentTokens[chairman.id].output,
          });

          // Generate follow-up suggestions
          try {
            const historyForFollowup = conversationHistory && conversationHistory.length > 0
              ? `ประวัติวาระก่อนหน้า:\n${conversationHistory.map((t, i) => `วาระที่ ${i + 1}: ${t.question}`).join("\n")}\n\n`
              : "";
            const followupResult = await callLLM(chairman.provider, chairman.model, chairApiKey, chairman.baseUrl, [
              {
                role: "system",
                content: "คุณช่วยแนะนำวาระการประชุมต่อเนื่องที่น่าสนใจ ตอบในรูปแบบ JSON array เท่านั้น เช่น [\"วาระ 1\", \"วาระ 2\", \"วาระ 3\"]",
              },
              {
                role: "user",
                content: `${historyForFollowup}วาระล่าสุด: ${question}\n\nมติที่ประชุม: ${result.content.slice(0, 500)}\n\nแนะนำ 3 วาระต่อเนื่องที่ควรพิจารณาต่อ ตอบเป็น JSON array เท่านั้น ไม่ต้องมีข้อความอื่น`,
              },
            ]);
            try {
              const jsonMatch = followupResult.content.match(/\[[\s\S]*\]/);
              const suggestions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
              if (suggestions.length > 0) {
                send("follow_up_suggestions", { suggestions: suggestions.slice(0, 3) });
              }
            } catch { /* ignore */ }
          } catch { /* ignore */ }

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
