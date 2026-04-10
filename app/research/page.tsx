"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  provider: string;
  model: string;
  role: string;
  active: boolean;
  hasApiKey: boolean;
}

interface ResearchMessage {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  role: "thinking" | "finding" | "analysis" | "synthesis" | "chat";
  content: string;
  tokensUsed: number;
  timestamp: string;
}

interface AgentTokenState {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ConversationRound {
  question: string;
  messages: ResearchMessage[];
  finalAnswer: string;
  agentTokens: Record<string, AgentTokenState>;
  suggestions: string[];
}

interface ConversationTurn {
  question: string;
  answer: string;
}

const ROLE_LABEL: Record<string, string> = {
  thinking: "💭 กำลังคิด",
  finding: "🔍 พบข้อมูล",
  analysis: "📊 วิเคราะห์",
  synthesis: "✍️ สรุป",
  chat: "💬 อภิปราย",
};

const ROLE_COLOR: Record<string, string> = {
  thinking: "border-yellow-500/30 bg-yellow-500/5",
  finding: "border-blue-500/30 bg-blue-500/5",
  analysis: "border-green-500/30 bg-green-500/5",
  synthesis: "border-purple-500/30 bg-purple-500/5",
  chat: "border-gray-500/30 bg-gray-500/5",
};

const DATA_SOURCES = [
  { id: "none", label: "None — ใช้ความรู้ของ model" },
  { id: "mcp", label: "🔌 MCP Server" },
  { id: "database", label: "🗄 MySQL / PostgreSQL" },
];

export default function ResearchPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [dataSource, setDataSource] = useState("none");
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  const [dbConnectionString, setDbConnectionString] = useState("");
  const [running, setRunning] = useState(false);
  const [agentTokens, setAgentTokens] = useState<Record<string, AgentTokenState>>({});
  const [status, setStatus] = useState("");

  // Conversation state
  const [rounds, setRounds] = useState<ConversationRound[]>([]);
  const [currentMessages, setCurrentMessages] = useState<ResearchMessage[]>([]);
  const [currentFinalAnswer, setCurrentFinalAnswer] = useState("");
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    const activeAgents = (data.agents ?? []).filter((a: Agent) => a.active);
    setAgents(activeAgents);
    setSelectedIds(new Set(activeAgents.map((a: Agent) => a.id)));
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages, rounds]);

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildHistory = (): ConversationTurn[] =>
    rounds.map((r) => ({ question: r.question, answer: r.finalAnswer }));

  const handleRun = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || selectedIds.size === 0 || running) return;

    setRunning(true);
    setCurrentMessages([]);
    setCurrentFinalAnswer("");
    setCurrentSuggestions([]);
    setAgentTokens({});
    setStatus("");
    if (!overrideQuestion) setQuestion("");

    abortRef.current = new AbortController();

    const roundTokens: Record<string, AgentTokenState> = {};

    try {
      const res = await fetch("/api/team-research/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          agentIds: Array.from(selectedIds),
          dataSource,
          mcpEndpoint: dataSource === "mcp" ? mcpEndpoint.trim() : undefined,
          dbConnectionString: dataSource === "database" ? dbConnectionString.trim() : undefined,
          conversationHistory: buildHistory(),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if ("message" in payload && typeof payload.message === "string") {
              setStatus(payload.message);
            } else if ("content" in payload && "agentId" in payload) {
              setCurrentMessages((prev) => [...prev, payload as ResearchMessage]);
            } else if ("content" in payload && !("agentId" in payload)) {
              setCurrentFinalAnswer(payload.content);
            } else if ("inputTokens" in payload) {
              const t = {
                inputTokens: payload.inputTokens,
                outputTokens: payload.outputTokens,
                totalTokens: payload.totalTokens,
              };
              roundTokens[payload.agentId] = t;
              setAgentTokens((prev) => ({ ...prev, [payload.agentId]: t }));
            } else if ("suggestions" in payload) {
              setCurrentSuggestions(payload.suggestions);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setStatus(`Error: ${e.message}`);
      }
    } finally {
      setRunning(false);
      // Commit current round to history
      setRounds((prev) => {
        const lastFinalAnswer = currentFinalAnswerRef.current;
        const lastMessages = currentMessagesRef.current;
        const lastSuggestions = currentSuggestionsRef.current;
        return [
          ...prev,
          {
            question: q,
            messages: lastMessages,
            finalAnswer: lastFinalAnswer,
            agentTokens: roundTokens,
            suggestions: lastSuggestions,
          },
        ];
      });
      setCurrentMessages([]);
      setCurrentFinalAnswer("");
      setCurrentSuggestions([]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  // Refs to capture latest state in finally block
  const currentFinalAnswerRef = useRef("");
  const currentMessagesRef = useRef<ResearchMessage[]>([]);
  const currentSuggestionsRef = useRef<string[]>([]);

  useEffect(() => { currentFinalAnswerRef.current = currentFinalAnswer; }, [currentFinalAnswer]);
  useEffect(() => { currentMessagesRef.current = currentMessages; }, [currentMessages]);
  useEffect(() => { currentSuggestionsRef.current = currentSuggestions; }, [currentSuggestions]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatus("หยุดการทำงาน");
  };

  const exportMarkdown = () => {
    const lines: string[] = ["# Team Research Session", `> Export: ${new Date().toLocaleString("th")}`, ""];
    rounds.forEach((r, i) => {
      lines.push(`## รอบที่ ${i + 1}: ${r.question}`, "");
      r.messages.forEach((m) => {
        if (m.role === "thinking") return;
        lines.push(`### ${m.agentEmoji} ${m.agentName} (${m.role})`, m.content, "");
      });
      if (r.finalAnswer) {
        lines.push("### ✅ สรุปคำตอบ", r.finalAnswer, "");
      }
      lines.push("---", "");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col p-6 gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono" style={{ color: "var(--text)" }}>
              🔬 Team Research
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              ถามต่อเรื่อย ๆ ได้ — agents จำ context และถกเถียงกันทุกรอบ
            </p>
          </div>
          {rounds.length > 0 && (
            <button
              onClick={exportMarkdown}
              className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              ⬇ Export Markdown
            </button>
          )}
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left panel */}
          <div className="flex flex-col gap-4 w-72 flex-shrink-0">
            {/* Agent selector */}
            <div
              className="border rounded-xl p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="text-xs font-mono mb-3" style={{ color: "var(--text-muted)" }}>
                เลือก Agents ({selectedIds.size}/{agents.length})
              </div>
              {agents.length === 0 ? (
                <div className="text-xs font-mono text-center py-4" style={{ color: "var(--text-muted)" }}>
                  ไม่มี agents — ไปที่ Team Agents ก่อน
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => {
                    const tokens = agentTokens[agent.id];
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        className="w-full text-left p-3 rounded-lg border transition-all"
                        style={{
                          borderColor: selectedIds.has(agent.id) ? "var(--accent)" : "var(--border)",
                          background: selectedIds.has(agent.id)
                            ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                            : "transparent",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span>{agent.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono font-bold truncate" style={{ color: "var(--text)" }}>
                              {agent.name}
                            </div>
                            <div className="text-xs font-mono truncate" style={{ color: "var(--text-muted)" }}>
                              {agent.role} · {agent.model.split("-").slice(0, 2).join("-")}
                            </div>
                          </div>
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: selectedIds.has(agent.id) ? "var(--accent)" : "var(--border)" }}
                          />
                        </div>
                        {tokens && (
                          <div className="mt-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--accent)" }}>▲ {tokens.inputTokens.toLocaleString()}</span>
                            {" / "}
                            <span>▼ {tokens.outputTokens.toLocaleString()}</span>
                            {" = "}
                            <span className="font-bold">{tokens.totalTokens.toLocaleString()} tokens</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Data source */}
            <div
              className="border rounded-xl p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                Data Source
              </div>
              <select
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                {DATA_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {dataSource === "mcp" && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>MCP Endpoint URL</div>
                  <input
                    type="url"
                    value={mcpEndpoint}
                    onChange={(e) => setMcpEndpoint(e.target.value)}
                    placeholder="http://localhost:3100/mcp"
                    className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              )}
              {dataSource === "database" && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Connection String</div>
                  <input
                    type="text"
                    value={dbConnectionString}
                    onChange={(e) => setDbConnectionString(e.target.value)}
                    placeholder="mysql://user:pass@host:3306/db"
                    className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              )}
            </div>

            {/* Session stats */}
            {rounds.length > 0 && (
              <div
                className="border rounded-xl p-4"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                  Session
                </div>
                <div className="text-xs font-mono space-y-1" style={{ color: "var(--text)" }}>
                  <div>{rounds.length} รอบที่ถามแล้ว</div>
                  <button
                    onClick={() => { setRounds([]); setCurrentMessages([]); setCurrentFinalAnswer(""); setCurrentSuggestions([]); }}
                    className="mt-2 text-xs font-mono px-2 py-1 rounded border w-full"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    🗑 เริ่ม session ใหม่
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main panel */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Conversation history (past rounds) */}
            <div className="flex-1 overflow-y-auto space-y-6 min-h-[200px]">

              {rounds.length === 0 && currentMessages.length === 0 && !running && (
                <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--text-muted)" }}>
                  ส่งคำถามเพื่อเริ่มต้น — agents จะวิเคราะห์และถกเถียงกัน<br />
                  <span className="text-xs opacity-60">ถามต่อเรื่อย ๆ ได้ agents จะจำ context ทั้งหมด</span>
                </div>
              )}

              {/* Past rounds */}
              {rounds.map((round, roundIndex) => (
                <div key={roundIndex} className="space-y-3">
                  {/* Round separator */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <div
                      className="text-xs font-mono px-3 py-1 rounded-full border"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
                    >
                      รอบที่ {roundIndex + 1}
                    </div>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                  </div>

                  {/* Question bubble */}
                  <div className="flex justify-end">
                    <div
                      className="max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-mono"
                      style={{ background: "var(--accent)", color: "#000" }}
                    >
                      {round.question}
                    </div>
                  </div>

                  {/* Messages */}
                  {round.messages.map((msg) => (
                    <div key={msg.id} className={`border rounded-xl p-4 ${ROLE_COLOR[msg.role] ?? ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{msg.agentEmoji}</span>
                        <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>{msg.agentName}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                          {ROLE_LABEL[msg.role] ?? msg.role}
                        </span>
                        {msg.tokensUsed > 0 && (
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>
                            {msg.tokensUsed.toLocaleString()} tokens
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {/* Final answer */}
                  {round.finalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>✅ คำตอบสุดท้าย</div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
                        {round.finalAnswer}
                      </div>
                    </div>
                  )}

                  {/* Follow-up suggestions (only last round) */}
                  {roundIndex === rounds.length - 1 && round.suggestions.length > 0 && currentMessages.length === 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>💡 คำถามต่อเนื่องที่น่าถาม:</div>
                      <div className="flex flex-col gap-2">
                        {round.suggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => handleRun(s)}
                            disabled={running}
                            className="text-left px-3 py-2 rounded-lg border text-xs font-mono transition-all hover:opacity-80 disabled:opacity-40"
                            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
                          >
                            → {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Current round (in progress) */}
              {(currentMessages.length > 0 || running) && (
                <div className="space-y-3">
                  {rounds.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                      <div
                        className="text-xs font-mono px-3 py-1 rounded-full border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
                      >
                        รอบที่ {rounds.length + 1}
                      </div>
                      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                    </div>
                  )}

                  {status && (
                    <div className="text-xs font-mono px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      {running && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-2 animate-pulse" />}
                      {status}
                    </div>
                  )}

                  {currentMessages.map((msg) => (
                    <div key={msg.id} className={`border rounded-xl p-4 ${ROLE_COLOR[msg.role] ?? ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{msg.agentEmoji}</span>
                        <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>{msg.agentName}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                          {ROLE_LABEL[msg.role] ?? msg.role}
                        </span>
                        {msg.tokensUsed > 0 && (
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>
                            {msg.tokensUsed.toLocaleString()} tokens
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {currentFinalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>✅ คำตอบสุดท้าย</div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
                        {currentFinalAnswer}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input box — always visible */}
            <div
              className="border rounded-xl p-4 flex-shrink-0"
              style={{ borderColor: running ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}
            >
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
                }}
                disabled={running}
                rows={2}
                placeholder={rounds.length > 0 ? "ถามต่อเลย... agents จำ context ทั้งหมด (Cmd+Enter)" : "พิมพ์คำถาม... (Cmd+Enter เพื่อส่ง)"}
                className="w-full bg-transparent font-mono text-sm resize-none outline-none"
                style={{ color: "var(--text)" }}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {rounds.length > 0 && <span style={{ color: "var(--accent)" }}>{rounds.length} รอบ · </span>}
                  {selectedIds.size} agents · Cmd+Enter
                </div>
                <div className="flex gap-2">
                  {running && (
                    <button
                      onClick={handleStop}
                      className="px-4 py-1.5 rounded-lg text-xs font-mono border border-red-500/30 text-red-400"
                    >
                      ⏹ หยุด
                    </button>
                  )}
                  <button
                    onClick={() => handleRun()}
                    disabled={!question.trim() || selectedIds.size === 0 || running}
                    className="px-5 py-1.5 rounded-lg text-xs font-mono font-bold disabled:opacity-40 transition-all"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    {running ? "กำลังทำงาน..." : "▶ ส่ง"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
