import { NextRequest, NextResponse } from "next/server";
import { listAgents, getAgentApiKey } from "@/lib/agents-store";

interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function callLLM(
  provider: string,
  model: string,
  apiKey: string,
  baseUrl: string | undefined,
  messages: LLMMessage[],
): Promise<string> {
  const maxTokens = 4096;

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
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemMsg?.content, messages: userMsgs }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }

  if (provider === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://openclaw-team-dashboard",
        "X-Title": "OpenClaw Mock Trial",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "openai" || provider === "custom") {
    const url = baseUrl ? `${baseUrl}/chat/completions` : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
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
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
    return data.message?.content ?? "";
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

const CASE_TYPE_LABELS: Record<string, string> = {
  civil: "คดีแพ่ง",
  criminal: "คดีอาญา",
  labor: "คดีแรงงาน",
  family: "คดีครอบครัว",
  admin: "คดีปกครอง",
};

function buildPrompt(input: {
  caseType: string;
  clientSide: string;
  caseTitle: string;
  caseStory: string;
  evidence: string;
  opposingInfo: string;
  relevantLaws: string;
}): LLMMessage[] {
  const caseLabel = CASE_TYPE_LABELS[input.caseType] || input.caseType;
  const sideLabel = input.clientSide === "plaintiff" ? "ฝ่ายโจทก์/ผู้ฟ้อง" : "ฝ่ายจำเลย/ผู้ถูกฟ้อง";

  const systemPrompt = `คุณคือระบบจำลองศาลของไทย (Thai Mock Trial Simulator) ที่มีความเชี่ยวชาญด้านกฎหมายไทยอย่างลึกซึ้ง คุณต้องวิเคราะห์คดีอย่างรอบด้านและจำลองมุมมองจากทุกฝ่ายในกระบวนการยุติธรรม

คุณต้องตอบเป็น JSON เท่านั้น โดยมีโครงสร้างดังนี้:
{
  "messages": [
    {"role": "analyst", "label": "นักวิเคราะห์คดี", "emoji": "🔍", "text": "..."},
    {"role": "prosecutor", "label": "ทนายฝ่ายโจทก์", "emoji": "🗣️", "text": "..."},
    {"role": "defense", "label": "ทนายฝ่ายจำเลย", "emoji": "🛡️", "text": "..."},
    {"role": "judge", "label": "ผู้พิพากษา", "emoji": "👨‍⚖️", "text": "..."}
  ],
  "winProbability": 65,
  "strengths": ["จุดแข็ง 1", "จุดแข็ง 2", "..."],
  "weaknesses": ["จุดอ่อน 1", "จุดอ่อน 2", "..."],
  "recommendation": "คำแนะนำสรุป..."
}

กฎในการวิเคราะห์:
1. อ้างอิงกฎหมายไทยจริง — มาตรา พ.ร.บ. ฎีกา ให้ชัดเจน
2. วิเคราะห์ตามหลักนิติศาสตร์ ไม่ใช่ความเห็นส่วนตัว
3. ระบุภาระการพิสูจน์ (burden of proof) ว่าอยู่ฝ่ายใด
4. คำนึงถึงอายุความ เขตอำนาจศาล และเงื่อนไขทางกฎหมาย
5. winProbability ต้องเป็นตัวเลข 0-100 ประเมินจากมุมมองของฝ่ายลูกค้า
6. ตอบเป็นภาษาไทยทั้งหมด
7. ตอบ JSON เท่านั้น ไม่ต้องมี markdown code block`;

  let userContent = `## คดีที่ต้องวิเคราะห์

**ประเภทคดี:** ${caseLabel}
**ลูกค้าของเราเป็น:** ${sideLabel}
**ชื่อคดี:** ${input.caseTitle}

### ข้อเท็จจริง / เรื่องราวคดี
${input.caseStory}`;

  if (input.evidence) {
    userContent += `\n\n### หลักฐานที่มี\n${input.evidence}`;
  }
  if (input.opposingInfo) {
    userContent += `\n\n### ข้อมูลฝ่ายตรงข้าม\n${input.opposingInfo}`;
  }
  if (input.relevantLaws) {
    userContent += `\n\n### กฎหมายที่เกี่ยวข้อง (ผู้ใช้ระบุ)\n${input.relevantLaws}`;
  }

  userContent += `\n\nกรุณาวิเคราะห์คดีนี้อย่างละเอียด จำลองมุมมองทั้งฝ่ายโจทก์ ฝ่ายจำเลย และผู้พิพากษา แล้วให้ผลลัพธ์เป็น JSON ตามโครงสร้างที่กำหนด`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, caseType, clientSide, caseTitle, caseStory, evidence, opposingInfo, relevantLaws } = body;

    if (!agentId || !caseTitle || !caseStory) {
      return NextResponse.json({ error: "กรุณาระบุ Agent, ชื่อคดี, และเรื่องราวคดี" }, { status: 400 });
    }

    // Find the agent
    const allAgents = listAgents();
    const agent = allAgents.find((a) => a.id === agentId);
    if (!agent) {
      return NextResponse.json({ error: "ไม่พบ Agent ที่ระบุ" }, { status: 404 });
    }

    const apiKey = getAgentApiKey(agentId);
    if (!apiKey && agent.provider !== "ollama") {
      return NextResponse.json({ error: "Agent นี้ยังไม่มี API Key — กรุณาตั้งค่าที่หน้า Team Agents" }, { status: 400 });
    }

    // Build prompt and call LLM
    const messages = buildPrompt({ caseType, clientSide, caseTitle, caseStory, evidence, opposingInfo, relevantLaws });
    const raw = await callLLM(agent.provider, agent.model, apiKey ?? "", agent.baseUrl, messages);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = raw.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    // Also try to find raw JSON object
    if (!jsonStr.startsWith("{")) {
      const braceStart = jsonStr.indexOf("{");
      const braceEnd = jsonStr.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
      }
    }

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      // If JSON parsing fails, construct a basic result from the raw text
      result = {
        messages: [
          { role: "analyst", label: "นักวิเคราะห์คดี", emoji: "🔍", text: raw },
        ],
        winProbability: 50,
        strengths: ["ดูรายละเอียดในการวิเคราะห์ด้านบน"],
        weaknesses: ["ดูรายละเอียดในการวิเคราะห์ด้านบน"],
        recommendation: "กรุณาอ่านผลวิเคราะห์ด้านบนอย่างละเอียด",
      };
    }

    // Validate and sanitize result
    const sanitized = {
      messages: Array.isArray(result.messages) ? result.messages.map((m: Record<string, unknown>) => ({
        role: String(m.role || "analyst"),
        label: String(m.label || ""),
        emoji: String(m.emoji || "📋"),
        text: String(m.text || ""),
      })) : [],
      winProbability: Math.max(0, Math.min(100, Number(result.winProbability) || 50)),
      strengths: Array.isArray(result.strengths) ? result.strengths.map(String) : [],
      weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses.map(String) : [],
      recommendation: String(result.recommendation || ""),
    };

    return NextResponse.json(sanitized);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
