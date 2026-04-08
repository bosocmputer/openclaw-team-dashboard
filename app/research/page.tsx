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
  const [messages, setMessages] = useState<ResearchMessage[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [agentTokens, setAgentTokens] = useState<Record<string, AgentTokenState>>({});
  const [history, setHistory] = useState<{ id: string; question: string; status: string; startedAt: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    const activeAgents = (data.agents ?? []).filter((a: Agent) => a.active);
    setAgents(activeAgents);
    // auto-select all active agents
    setSelectedIds(new Set(activeAgents.map((a: Agent) => a.id)));
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetch("/api/team-research");
    const data = await res.json();
    setHistory((data.sessions ?? []).slice(0, 10));
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchHistory();
  }, [fetchAgents, fetchHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRun = async () => {
    if (!question.trim() || selectedIds.size === 0 || running) return;
    setRunning(true);
    setMessages([]);
    setFinalAnswer("");
    setStatus("");
    setAgentTokens({});

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/team-research/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          agentIds: Array.from(selectedIds),
          dataSource,
          mcpEndpoint: dataSource === "mcp" ? mcpEndpoint.trim() : undefined,
          dbConnectionString: dataSource === "database" ? dbConnectionString.trim() : undefined,
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
              // status event
              setStatus(payload.message);
            } else if ("content" in payload && "agentId" in payload) {
              // message event
              setMessages((prev) => [...prev, payload as ResearchMessage]);
            } else if ("content" in payload && !("agentId" in payload)) {
              // final_answer
              setFinalAnswer(payload.content);
            } else if ("inputTokens" in payload) {
              // agent_tokens
              setAgentTokens((prev) => ({
                ...prev,
                [payload.agentId]: {
                  inputTokens: payload.inputTokens,
                  outputTokens: payload.outputTokens,
                  totalTokens: payload.totalTokens,
                },
              }));
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setStatus(`Error: ${e.message}`);
      }
    } finally {
      setRunning(false);
      fetchHistory();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatus("หยุดการทำงาน");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col p-6 gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-mono" style={{ color: "var(--text)" }}>
            🔬 Team Research
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            ถามคำถาม — agents ทุกตัวจะวิเคราะห์และอภิปรายกันแล้วส่งคำตอบที่ดีที่สุดมาให้
          </p>
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

              {/* MCP endpoint input */}
              {dataSource === "mcp" && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    MCP Endpoint URL
                  </div>
                  <input
                    type="url"
                    value={mcpEndpoint}
                    onChange={(e) => setMcpEndpoint(e.target.value)}
                    placeholder="http://localhost:3100/mcp"
                    className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                    context จาก MCP จะถูก inject เข้า prompt
                  </div>
                </div>
              )}

              {/* Database connection string */}
              {dataSource === "database" && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    Connection String
                  </div>
                  <input
                    type="text"
                    value={dbConnectionString}
                    onChange={(e) => setDbConnectionString(e.target.value)}
                    placeholder="mysql://user:pass@host:3306/db"
                    className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                    รองรับ MySQL / PostgreSQL (read-only)
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div
                className="border rounded-xl p-4 flex-1 overflow-y-auto"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                  ประวัติล่าสุด
                </div>
                <div className="space-y-2">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setQuestion(h.question)}
                      className="w-full text-left p-2 rounded-lg border transition-all hover:border-current"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="text-xs font-mono line-clamp-2" style={{ color: "var(--text)" }}>
                        {h.question}
                      </div>
                      <div className="text-xs font-mono mt-1" style={{ color: "var(--text-muted)" }}>
                        {h.status === "completed" ? "✅" : h.status === "error" ? "❌" : "⏳"}{" "}
                        {new Date(h.startedAt).toLocaleDateString("th")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main panel */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Question input */}
            <div
              className="border rounded-xl p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                คำถาม / โจทย์
              </div>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
                }}
                disabled={running}
                rows={3}
                placeholder="พิมพ์คำถามที่ต้องการให้ทีม agents ช่วยวิเคราะห์... (Cmd+Enter เพื่อส่ง)"
                className="w-full bg-transparent font-mono text-sm resize-none outline-none"
                style={{ color: "var(--text)" }}
              />
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {selectedIds.size === 0 ? (
                    <span className="text-red-400">⚠ เลือก agent อย่างน้อย 1 ตัว</span>
                  ) : (
                    <span>
                      {selectedIds.size} agents พร้อม · Cmd+Enter เพื่อส่ง
                    </span>
                  )}
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
                    onClick={handleRun}
                    disabled={!question.trim() || selectedIds.size === 0 || running}
                    className="px-5 py-1.5 rounded-lg text-xs font-mono font-bold disabled:opacity-40 transition-all"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    {running ? "กำลังทำงาน..." : "▶ ส่ง"}
                  </button>
                </div>
              </div>
            </div>

            {/* Status */}
            {status && (
              <div className="text-xs font-mono px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                {running && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-2 animate-pulse" />}
                {status}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
              {messages.length === 0 && !running && (
                <div
                  className="text-center py-20 font-mono text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  ส่งคำถามเพื่อเริ่มต้น — agents จะวิเคราะห์และอภิปรายกัน
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`border rounded-xl p-4 ${ROLE_COLOR[msg.role] ?? ""}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{msg.agentEmoji}</span>
                    <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>
                      {msg.agentName}
                    </span>
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      {ROLE_LABEL[msg.role] ?? msg.role}
                    </span>
                    {msg.tokensUsed > 0 && (
                      <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>
                        {msg.tokensUsed.toLocaleString()} tokens
                      </span>
                    )}
                  </div>
                  <div
                    className="text-sm font-mono whitespace-pre-wrap leading-relaxed"
                    style={{ color: "var(--text)" }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Final Answer */}
              {finalAnswer && (
                <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                  <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>
                    ✅ คำตอบสุดท้าย
                  </div>
                  <div
                    className="text-sm font-mono whitespace-pre-wrap leading-relaxed"
                    style={{ color: "var(--text)" }}
                  >
                    {finalAnswer}
                  </div>
                  {Object.keys(agentTokens).length > 0 && (
                    <div className="mt-4 pt-3 border-t flex flex-wrap gap-3" style={{ borderColor: "var(--border)" }}>
                      {agents
                        .filter((a) => agentTokens[a.id])
                        .map((a) => (
                          <div key={a.id} className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            {a.emoji} {a.name}:{" "}
                            <span style={{ color: "var(--accent)" }}>
                              {agentTokens[a.id].totalTokens.toLocaleString()} tokens
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
