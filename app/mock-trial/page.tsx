"use client";

import { useState, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type CaseType = "civil" | "criminal" | "labor" | "family" | "admin";
type TrialPhase = "idle" | "analyzing" | "prosecution" | "defense" | "judgment" | "done";

interface AgentOption {
  id: string;
  name: string;
  emoji: string;
  model: string;
  provider: string;
}

interface TrialMessage {
  role: "system" | "prosecutor" | "defense" | "judge" | "analyst";
  label: string;
  emoji: string;
  text: string;
}

interface TrialResult {
  messages: TrialMessage[];
  winProbability: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CASE_TYPES: { value: CaseType; label: string; emoji: string; desc: string }[] = [
  { value: "civil", label: "คดีแพ่ง", emoji: "📄", desc: "หนี้สิน สัญญา ละเมิด ทรัพย์สิน" },
  { value: "criminal", label: "คดีอาญา", emoji: "⚖️", desc: "ความผิดอาญา ฉ้อโกง ลักทรัพย์" },
  { value: "labor", label: "คดีแรงงาน", emoji: "👷", desc: "เลิกจ้าง ค่าชดเชย สวัสดิการ" },
  { value: "family", label: "คดีครอบครัว", emoji: "👨‍👩‍👧", desc: "หย่า อำนาจปกครอง มรดก" },
  { value: "admin", label: "คดีปกครอง", emoji: "🏛️", desc: "ฟ้องหน่วยงานรัฐ เพิกถอนคำสั่ง" },
];

const MODEL_RECOMMENDATIONS = [
  { tier: "แนะนำสูงสุด", models: ["Claude 4.5 Sonnet", "GPT-5.4"], reason: "ความแม่นยำในการวิเคราะห์กฎหมาย + เข้าใจภาษาไทยดีเยี่ยม", color: "emerald" },
  { tier: "คุ้มค่า", models: ["Gemini 2.5 Pro", "GPT-4.1 Mini"], reason: "Context ยาว 1M tokens สำหรับเอกสารคดีจำนวนมาก", color: "blue" },
  { tier: "ประหยัด", models: ["DeepSeek V3.2", "Gemini 2.5 Flash"], reason: "ต้นทุนต่ำ เหมาะกับงานค้นคว้าเบื้องต้น", color: "amber" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function MockTrialPage() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);

  const [caseType, setCaseType] = useState<CaseType>("civil");
  const [clientSide, setClientSide] = useState<"plaintiff" | "defendant">("plaintiff");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseStory, setCaseStory] = useState("");
  const [evidence, setEvidence] = useState("");
  const [opposingInfo, setOpposingInfo] = useState("");
  const [relevantLaws, setRelevantLaws] = useState("");

  const [phase, setPhase] = useState<TrialPhase>("idle");
  const [result, setResult] = useState<TrialResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [showModelGuide, setShowModelGuide] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/team-agents")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.agents ?? []).filter((a: AgentOption & { active: boolean; hasApiKey: boolean }) => a.active && a.hasApiKey);
        setAgents(active);
        if (active.length > 0) setSelectedAgent(active[0].id);
      })
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    if (phase === "done" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const canSubmit = caseTitle.trim() && caseStory.trim() && selectedAgent && phase === "idle";

  const runTrial = async () => {
    if (!canSubmit) return;
    setPhase("analyzing");
    setResult(null);
    setStreamingText("");
    setError("");

    try {
      const res = await fetch("/api/mock-trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          caseType,
          clientSide,
          caseTitle: caseTitle.trim(),
          caseStory: caseStory.trim(),
          evidence: evidence.trim(),
          opposingInfo: opposingInfo.trim(),
          relevantLaws: relevantLaws.trim(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "เกิดข้อผิดพลาดในการวิเคราะห์คดี");
      }

      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        // Stream response
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          setPhase("prosecution");
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.phase) {
                    setPhase(parsed.phase as TrialPhase);
                  }
                  if (parsed.text) {
                    accumulated += parsed.text;
                    setStreamingText(accumulated);
                  }
                  if (parsed.result) {
                    setResult(parsed.result);
                    setPhase("done");
                  }
                } catch {
                  // skip malformed chunks
                }
              }
            }
          }
        }
      } else {
        // JSON response (fallback)
        const data = await res.json();
        setResult(data);
        setPhase("done");
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setPhase("idle");
    }
  };

  const resetTrial = () => {
    setPhase("idle");
    setResult(null);
    setStreamingText("");
    setError("");
  };

  const phaseLabels: Record<TrialPhase, { label: string; emoji: string }> = {
    idle: { label: "พร้อมเริ่ม", emoji: "⚖️" },
    analyzing: { label: "กำลังวิเคราะห์ข้อเท็จจริง...", emoji: "🔍" },
    prosecution: { label: "ฝ่ายโจทก์กำลังเสนอข้อกล่าวอ้าง...", emoji: "🗣️" },
    defense: { label: "ฝ่ายจำเลยกำลังต่อสู้คดี...", emoji: "🛡️" },
    judgment: { label: "ผู้พิพากษากำลังพิจารณาคำตัดสิน...", emoji: "👨‍⚖️" },
    done: { label: "การพิจารณาคดีเสร็จสิ้น", emoji: "✅" },
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold font-mono" style={{ color: "var(--text)" }}>
            🏛️ ศาลจำลอง — Mock Trial Simulator
          </h1>
          <p className="text-sm mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
            จำลองการพิจารณาคดี วิเคราะห์จุดแข็ง-จุดอ่อน ประเมินโอกาสชนะคดี
          </p>
          <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
            ⚠️ ผลวิเคราะห์เป็นเพียงการจำลองเบื้องต้น ไม่ใช่คำแนะนำทางกฎหมายที่เป็นทางการ — ควรปรึกษาทนายความจริงเสมอ
          </p>
        </div>

        {/* Model Recommendation Tip */}
        <div className="mb-6">
          <button
            onClick={() => setShowModelGuide(!showModelGuide)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            🤖 {showModelGuide ? "ซ่อนคำแนะนำ Model" : "แนะนำ Model สำหรับงานกฎหมาย"}
          </button>
          {showModelGuide && (
            <div className="mt-3 grid gap-2">
              {MODEL_RECOMMENDATIONS.map((rec) => (
                <div
                  key={rec.tier}
                  className="p-3 rounded-xl border font-mono"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{rec.tier}</span>
                    <span className="text-xs" style={{ color: "var(--text)" }}>{rec.models.join(" / ")}</span>
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{rec.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Input Form ── */}
        <div className="space-y-5 mb-8">
          {/* Agent Selection */}
          <div className="p-4 rounded-xl border-2" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
            <label className="text-xs font-mono font-bold mb-2 block" style={{ color: "var(--accent)" }}>
              🤖 เลือก Agent สำหรับวิเคราะห์คดี *
            </label>
            {loadingAgents ? (
              <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>กำลังโหลด agents...</div>
            ) : agents.length === 0 ? (
              <div className="text-xs font-mono p-3 rounded-lg border" style={{ borderColor: "#ef444440", background: "#ef444410", color: "#f87171" }}>
                ⚠️ ยังไม่มี Agent ที่ใช้งานได้ — กรุณาสร้าง Agent พร้อม API Key ที่หน้า <a href="/agents" className="underline">Team Agents</a> ก่อน
              </div>
            ) : (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border font-mono text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name} — {a.model} ({a.provider})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Case Type Selection */}
          <div>
            <label className="text-xs font-mono font-bold mb-2 block" style={{ color: "var(--text-muted)" }}>
              ประเภทคดี
            </label>
            <div className="grid grid-cols-5 gap-2">
              {CASE_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setCaseType(ct.value)}
                  className="p-3 rounded-xl border text-center transition-all"
                  style={{
                    borderColor: caseType === ct.value ? "var(--accent)" : "var(--border)",
                    background: caseType === ct.value ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--surface)",
                  }}
                >
                  <div className="text-xl mb-1">{ct.emoji}</div>
                  <div className="text-xs font-mono font-bold" style={{ color: caseType === ct.value ? "var(--accent)" : "var(--text)" }}>
                    {ct.label}
                  </div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{ct.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Client Side */}
          <div>
            <label className="text-xs font-mono font-bold mb-2 block" style={{ color: "var(--text-muted)" }}>
              ลูกค้าของคุณเป็นฝ่ายใด
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setClientSide("plaintiff")}
                className="flex-1 p-3 rounded-xl border text-center transition-all"
                style={{
                  borderColor: clientSide === "plaintiff" ? "var(--accent)" : "var(--border)",
                  background: clientSide === "plaintiff" ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--surface)",
                }}
              >
                <div className="text-lg">🗣️</div>
                <div className="text-xs font-mono font-bold" style={{ color: clientSide === "plaintiff" ? "var(--accent)" : "var(--text)" }}>
                  ฝ่ายโจทก์ / ผู้ฟ้อง
                </div>
              </button>
              <button
                onClick={() => setClientSide("defendant")}
                className="flex-1 p-3 rounded-xl border text-center transition-all"
                style={{
                  borderColor: clientSide === "defendant" ? "var(--accent)" : "var(--border)",
                  background: clientSide === "defendant" ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--surface)",
                }}
              >
                <div className="text-lg">🛡️</div>
                <div className="text-xs font-mono font-bold" style={{ color: clientSide === "defendant" ? "var(--accent)" : "var(--text)" }}>
                  ฝ่ายจำเลย / ผู้ถูกฟ้อง
                </div>
              </button>
            </div>
          </div>

          {/* Case Title */}
          <div>
            <label className="text-xs font-mono font-bold mb-1 block" style={{ color: "var(--text-muted)" }}>
              ชื่อคดี / หัวข้อ *
            </label>
            <input
              value={caseTitle}
              onChange={(e) => setCaseTitle(e.target.value)}
              placeholder="เช่น คดีผิดสัญญาซื้อขายที่ดิน, คดีเลิกจ้างไม่เป็นธรรม"
              className="w-full px-3 py-2 rounded-lg border font-mono"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Case Story */}
          <div>
            <label className="text-xs font-mono font-bold mb-1 block" style={{ color: "var(--text-muted)" }}>
              เรื่องราวคดี / ข้อเท็จจริง *
            </label>
            <textarea
              value={caseStory}
              onChange={(e) => setCaseStory(e.target.value)}
              rows={6}
              placeholder={`อธิบายรายละเอียดของคดี:\n- เกิดอะไรขึ้น เมื่อไหร่\n- ใครคือคู่กรณี\n- ข้อพิพาทคืออะไร\n- มีการเจรจาอะไรมาก่อนหรือไม่`}
              className="w-full px-3 py-2 rounded-lg border font-mono text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <div className="text-[10px] font-mono mt-1" style={{ color: "var(--text-muted)" }}>{caseStory.length} ตัวอักษร</div>
          </div>

          {/* Evidence */}
          <div>
            <label className="text-xs font-mono font-bold mb-1 block" style={{ color: "var(--text-muted)" }}>
              หลักฐานที่มี (ถ้ามี)
            </label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={4}
              placeholder={`ระบุหลักฐานที่มี เช่น:\n- สัญญาเป็นลายลักษณ์อักษร ลงวันที่...\n- ใบเสร็จ/ใบแจ้งหนี้\n- แชท LINE/Email ที่เกี่ยวข้อง\n- พยานบุคคล (ใคร รู้เห็นอะไร)`}
              className="w-full px-3 py-2 rounded-lg border font-mono text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Opposing Info */}
          <div>
            <label className="text-xs font-mono font-bold mb-1 block" style={{ color: "var(--text-muted)" }}>
              ข้อมูลฝ่ายตรงข้าม (ถ้ามี)
            </label>
            <textarea
              value={opposingInfo}
              onChange={(e) => setOpposingInfo(e.target.value)}
              rows={3}
              placeholder="ข้อกล่าวอ้างของอีกฝ่าย, หลักฐานที่อีกฝ่ายอาจมี, จุดแข็งของเขา..."
              className="w-full px-3 py-2 rounded-lg border font-mono text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Relevant Laws */}
          <div>
            <label className="text-xs font-mono font-bold mb-1 block" style={{ color: "var(--text-muted)" }}>
              กฎหมายที่เกี่ยวข้อง (ถ้าทราบ)
            </label>
            <textarea
              value={relevantLaws}
              onChange={(e) => setRelevantLaws(e.target.value)}
              rows={2}
              placeholder="เช่น ปพพ. มาตรา 456, พ.ร.บ.คุ้มครองแรงงาน มาตรา 118"
              className="w-full px-3 py-2 rounded-lg border font-mono text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono">{error}</div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={runTrial}
              disabled={!canSubmit}
              className="flex-1 px-6 py-3 rounded-xl text-sm font-mono font-bold transition-all disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {phase === "idle" ? "🏛️ เริ่มศาลจำลอง" : phaseLabels[phase].emoji + " " + phaseLabels[phase].label}
            </button>
            {phase === "done" && (
              <button
                onClick={resetTrial}
                className="px-6 py-3 rounded-xl text-sm font-mono border transition-all"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                🔄 เริ่มใหม่
              </button>
            )}
          </div>
        </div>

        {/* ── Progress Indicator ── */}
        {phase !== "idle" && phase !== "done" && (
          <div className="mb-8 p-4 rounded-xl border" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
            <div className="flex items-center gap-3">
              <div className="animate-spin text-lg">⚖️</div>
              <div>
                <div className="text-sm font-mono font-bold" style={{ color: "var(--accent)" }}>
                  {phaseLabels[phase].emoji} {phaseLabels[phase].label}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                  กรุณารอสักครู่ — AI กำลังวิเคราะห์คดีอย่างละเอียด
                </div>
              </div>
            </div>
            {streamingText && (
              <div
                className="mt-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto p-3 rounded-lg"
                style={{ background: "var(--bg)", color: "var(--text)", borderColor: "var(--border)" }}
              >
                {streamingText}
              </div>
            )}
          </div>
        )}

        {/* ── Trial Result ── */}
        {result && phase === "done" && (
          <div ref={resultRef} className="space-y-6">
            {/* Win Probability */}
            <div className="p-6 rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-center mb-4">
                <div className="text-xs font-mono font-bold mb-2" style={{ color: "var(--text-muted)" }}>
                  📊 โอกาสชนะคดี (ประเมินเบื้องต้น)
                </div>
                <div
                  className="text-5xl font-bold font-mono"
                  style={{
                    color: result.winProbability >= 70
                      ? "#4ade80"
                      : result.winProbability >= 40
                      ? "#facc15"
                      : "#f87171",
                  }}
                >
                  {result.winProbability}%
                </div>
                <div className="text-xs font-mono mt-1" style={{ color: "var(--text-muted)" }}>
                  {result.winProbability >= 70
                    ? "🟢 โอกาสค่อนข้างดี — มีหลักฐานและข้อกฎหมายสนับสนุน"
                    : result.winProbability >= 40
                    ? "🟡 ยังมีความเสี่ยง — ต้องเตรียมตัวเพิ่มเติม"
                    : "🔴 โอกาสน้อย — ต้องทบทวนกลยุทธ์ใหม่"}
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${result.winProbability}%`,
                    background: result.winProbability >= 70
                      ? "#4ade80"
                      : result.winProbability >= 40
                      ? "#facc15"
                      : "#f87171",
                  }}
                />
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border" style={{ borderColor: "#22c55e40", background: "#22c55e08" }}>
                <div className="text-xs font-mono font-bold mb-3" style={{ color: "#4ade80" }}>
                  💪 จุดแข็งของคดี
                </div>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-xs font-mono flex gap-2" style={{ color: "var(--text)" }}>
                      <span style={{ color: "#4ade80" }}>✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-xl border" style={{ borderColor: "#ef444440", background: "#ef444408" }}>
                <div className="text-xs font-mono font-bold mb-3" style={{ color: "#f87171" }}>
                  ⚠️ จุดอ่อน / ความเสี่ยง
                </div>
                <ul className="space-y-2">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs font-mono flex gap-2" style={{ color: "var(--text)" }}>
                      <span style={{ color: "#f87171" }}>✗</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Trial Messages (Simulation) */}
            <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-mono font-bold mb-4" style={{ color: "var(--text-muted)" }}>
                🏛️ จำลองการพิจารณาคดี
              </div>
              <div className="space-y-4">
                {result.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border"
                    style={{
                      borderColor:
                        msg.role === "judge" ? "#a78bfa40" :
                        msg.role === "prosecutor" ? "#60a5fa40" :
                        msg.role === "defense" ? "#f9731640" :
                        "var(--border)",
                      background:
                        msg.role === "judge" ? "#a78bfa08" :
                        msg.role === "prosecutor" ? "#60a5fa08" :
                        msg.role === "defense" ? "#f9731608" :
                        "var(--bg)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{msg.emoji}</span>
                      <span
                        className="text-xs font-mono font-bold"
                        style={{
                          color:
                            msg.role === "judge" ? "#a78bfa" :
                            msg.role === "prosecutor" ? "#60a5fa" :
                            msg.role === "defense" ? "#fb923c" :
                            "var(--accent)",
                        }}
                      >
                        {msg.label}
                      </span>
                    </div>
                    <div className="text-xs font-mono whitespace-pre-wrap" style={{ color: "var(--text)", lineHeight: 1.7 }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-5 rounded-xl border-2" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
              <div className="text-xs font-mono font-bold mb-2" style={{ color: "var(--accent)" }}>
                📋 คำแนะนำจากการวิเคราะห์
              </div>
              <div className="text-sm font-mono whitespace-pre-wrap" style={{ color: "var(--text)", lineHeight: 1.8 }}>
                {result.recommendation}
              </div>
            </div>

            {/* Disclaimer */}
            <div className="p-3 rounded-lg border text-center" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                ⚠️ <strong>ข้อจำกัดความรับผิดชอบ:</strong> ผลการจำลองนี้เป็นเพียงการวิเคราะห์เบื้องต้นโดย AI เท่านั้น
                ไม่ถือเป็นคำแนะนำทางกฎหมายที่เป็นทางการ ผลคดีจริงขึ้นอยู่กับปัจจัยหลายอย่าง — กรุณาปรึกษาทนายความที่มีใบอนุญาตเสมอ
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
