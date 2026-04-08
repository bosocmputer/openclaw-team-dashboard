"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SessionSummary {
  id: string;
  question: string;
  agentIds: string[];
  status: string;
  startedAt: string;
  completedAt?: string;
  totalTokens: number;
}

interface FullSession extends SessionSummary {
  messages: ResearchMessage[];
  finalAnswer?: string;
  dataSource?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  thinking: "💭 กำลังคิด",
  finding: "🔍 พบข้อมูล",
  analysis: "📊 วิเคราะห์",
  synthesis: "✍️ สรุป",
  chat: "💬 อภิปราย",
};

const ROLE_COLOR: Record<string, string> = {
  thinking: "border-yellow-500/30 bg-yellow-500/8",
  finding: "border-blue-500/30 bg-blue-500/8",
  analysis: "border-green-500/30 bg-green-500/8",
  synthesis: "border-purple-500/30 bg-purple-500/8",
  chat: "border-gray-500/20 bg-gray-500/5",
};

const DATA_SOURCES = [
  { id: "none", label: "None — ใช้ความรู้ของ model" },
  { id: "mcp", label: "🔌 MCP Server" },
  { id: "database", label: "🗄 MySQL / PostgreSQL" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MeetingPage() {
  // Agent & selection state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Live meeting state
  const [agenda, setAgenda] = useState("");
  const [dataSource, setDataSource] = useState("none");
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  const [dbConnectionString, setDbConnectionString] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<ResearchMessage[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [agentTokens, setAgentTokens] = useState<Record<string, { inputTokens: number; outputTokens: number; totalTokens: number }>>({});
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // History state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [viewingSession, setViewingSession] = useState<FullSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    const active = (data.agents ?? []).filter((a: Agent) => a.active);
    setAgents(active);
    setSelectedIds((prev) => {
      if (prev.size === 0) return new Set(active.map((a: Agent) => a.id));
      return prev;
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetch("/api/team-research");
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchHistory();
  }, [fetchAgents, fetchHistory]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, viewingSession]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const toggleAgent = (id: string) => {
    if (running || viewingSession) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadSession = async (id: string) => {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/team-research/${id}`);
      const data = await res.json();
      if (data.session) setViewingSession(data.session);
    } finally {
      setLoadingSession(false);
    }
  };

  const closeHistory = () => {
    setViewingSession(null);
  };

  const reuseQuestion = () => {
    if (!viewingSession) return;
    setAgenda(viewingSession.question);
    setViewingSession(null);
    setMessages([]);
    setFinalAnswer("");
    setStatus("");
    setAgentTokens({});
  };

  const handleRun = async () => {
    if (!agenda.trim() || selectedIds.size === 0 || running) return;
    setViewingSession(null);
    setRunning(true);
    setMessages([]);
    setFinalAnswer("");
    setStatus("");
    setAgentTokens({});
    setActiveAgentId(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/team-research/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: agenda.trim(),
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
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if ("message" in payload && typeof payload.message === "string") {
              setStatus(payload.message);
            } else if ("content" in payload && "agentId" in payload) {
              setMessages((prev) => [...prev, payload as ResearchMessage]);
              setActiveAgentId(payload.agentId);
            } else if ("content" in payload && !("agentId" in payload)) {
              setFinalAnswer(payload.content);
              setActiveAgentId(null);
            } else if ("inputTokens" in payload) {
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
      setActiveAgentId(null);
      fetchHistory();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setActiveAgentId(null);
    setStatus("หยุดการประชุม");
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const displayMessages = viewingSession ? viewingSession.messages : messages;
  const displayFinalAnswer = viewingSession ? (viewingSession.finalAnswer ?? "") : finalAnswer;
  const currentAgenda = viewingSession ? viewingSession.question : agenda;
  const isLive = !viewingSession && (running || messages.length > 0 || !!finalAnswer);

  const filteredSessions = sessions.filter((s) =>
    !historySearch || s.question.toLowerCase().includes(historySearch.toLowerCase())
  );

  // Group sessions by date
  const sessionsByDate: { label: string; items: SessionSummary[] }[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  for (const s of filteredSessions) {
    const d = new Date(s.startedAt);
    let label = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    if (d.toDateString() === today.toDateString()) label = "วันนี้";
    else if (d.toDateString() === yesterday.toDateString()) label = "เมื่อวาน";
    const group = sessionsByDate.find((g) => g.label === label);
    if (group) group.items.push(s);
    else sessionsByDate.push({ label, items: [s] });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 0px)" }}>

      {/* ── Left sidebar: Meeting History ── */}
      <aside
        className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="font-semibold text-sm">🏛 ห้องประชุม</div>
          <div className="text-xs opacity-50 mt-0.5">ประวัติการประชุม Team Agents</div>
        </div>

        {/* New meeting button */}
        <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => { closeHistory(); setMessages([]); setFinalAnswer(""); setStatus(""); setAgentTokens({}); }}
            className="w-full py-2 text-xs font-medium border transition-colors"
            style={{
              borderColor: "var(--accent)",
              color: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 10%, transparent)",
            }}
          >
            + เริ่มประชุมใหม่
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="ค้นหาประวัติ..."
            className="w-full px-2 py-1.5 text-xs border bg-transparent focus:outline-none"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-1 pb-3">
          {sessions.length === 0 && (
            <div className="text-center py-8 text-xs opacity-40">
              ยังไม่มีประวัติการประชุม
            </div>
          )}
          {sessionsByDate.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-1.5 text-xs font-medium opacity-40 sticky top-0" style={{ background: "var(--surface)" }}>
                {group.label}
              </div>
              {group.items.map((s) => {
                const isActive = viewingSession?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    disabled={loadingSession}
                    className="w-full text-left px-3 py-2.5 transition-colors"
                    style={{
                      background: isActive ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <div
                      className="text-xs leading-snug line-clamp-2"
                      style={{ color: isActive ? "var(--accent)" : "var(--text)" }}
                    >
                      {s.question}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs opacity-40">
                      <span>{s.status === "completed" ? "✅" : s.status === "error" ? "❌" : "⏳"}</span>
                      <span>{s.agentIds.length} agents</span>
                      {s.totalTokens > 0 && <span>{s.totalTokens.toLocaleString()} tok</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main meeting area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Attendees bar */}
        <div
          className="border-b px-5 py-3 flex-shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs opacity-40 font-medium flex-shrink-0">ผู้เข้าร่วม</span>
            {agents.length === 0 ? (
              <a href="/agents" className="text-xs opacity-60 px-2 py-1 border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
                + เพิ่ม agents ก่อน
              </a>
            ) : (
              agents.map((a) => {
                const isSelected = selectedIds.has(a.id);
                const isActive = activeAgentId === a.id;
                const tokens = agentTokens[a.id];
                const isViewingAgent = viewingSession?.agentIds.includes(a.id);
                const showAgent = viewingSession ? isViewingAgent : true;
                if (!showAgent) return null;
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAgent(a.id)}
                    title={`${a.name} — ${a.role}`}
                    className="flex items-center gap-2 px-3 py-1.5 border text-xs transition-all"
                    style={{
                      borderColor: isActive
                        ? "var(--accent)"
                        : isSelected
                        ? "color-mix(in srgb, var(--accent) 50%, var(--border))"
                        : "var(--border)",
                      background: isActive
                        ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                        : isSelected
                        ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                        : "transparent",
                      opacity: (!viewingSession && !isSelected) ? 0.4 : 1,
                      boxShadow: isActive ? "0 0 0 1px var(--accent)" : "none",
                    }}
                  >
                    <span className="text-base">{a.emoji}</span>
                    <div>
                      <div className="font-medium" style={{ color: isActive ? "var(--accent)" : "var(--text)" }}>
                        {a.name}
                      </div>
                      <div className="opacity-50">{a.role}</div>
                    </div>
                    {tokens && (
                      <div className="ml-1 opacity-60" style={{ color: "var(--accent)" }}>
                        {tokens.totalTokens.toLocaleString()}tok
                      </div>
                    )}
                    {isActive && (
                      <span className="flex gap-0.5 items-center ml-1">
                        <span className="w-1 h-1 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Viewing history banner */}
        {viewingSession && (
          <div
            className="flex items-center gap-3 px-5 py-2 text-xs border-b flex-shrink-0"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
              color: "var(--text-muted)",
            }}
          >
            <span className="font-medium" style={{ color: "var(--accent)" }}>📋 บันทึกการประชุม</span>
            <span>·</span>
            <span>
              {new Date(viewingSession.startedAt).toLocaleString("th-TH", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              })}
            </span>
            {viewingSession.completedAt && (
              <>
                <span>·</span>
                <span>
                  {Math.round((new Date(viewingSession.completedAt).getTime() - new Date(viewingSession.startedAt).getTime()) / 1000)}s
                </span>
              </>
            )}
            {viewingSession.totalTokens > 0 && (
              <>
                <span>·</span>
                <span>{viewingSession.totalTokens.toLocaleString()} tokens</span>
              </>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={reuseQuestion}
                className="px-3 py-0.5 border text-xs transition-colors"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                🔄 ประชุมซ้ำ
              </button>
              <button
                onClick={closeHistory}
                className="px-3 py-0.5 border text-xs opacity-60 hover:opacity-100 transition-opacity"
                style={{ borderColor: "var(--border)" }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Transcript / Messages area */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-6 flex flex-col gap-4">

            {/* Meeting title */}
            {(currentAgenda || isLive) && (
              <div
                className="border-l-4 pl-4 py-2"
                style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}
              >
                <div className="text-xs opacity-50 mb-1 font-medium uppercase tracking-wider">วาระการประชุม</div>
                <div className="font-semibold text-sm leading-relaxed">{currentAgenda}</div>
                {viewingSession && (
                  <div className="text-xs opacity-40 mt-1">
                    {viewingSession.messages.length} ข้อความ
                    {viewingSession.finalAnswer ? " · มีมติที่ประชุม" : ""}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {displayMessages.length === 0 && !running && !viewingSession && (
              <div className="text-center py-24">
                <div className="text-4xl mb-4">🏛</div>
                <div className="text-sm opacity-40">
                  ยังไม่มีวาระ — กรอกคำถามด้านล่างแล้วกด &ldquo;เริ่มประชุม&rdquo;
                </div>
                <div className="text-xs opacity-25 mt-2">
                  หรือคลิกประวัติทางซ้ายเพื่อดูบันทึกการประชุมเก่า
                </div>
              </div>
            )}

            {/* Running status */}
            {running && messages.length === 0 && (
              <div className="text-xs opacity-50 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {status || "กำลังเริ่มต้นการประชุม..."}
              </div>
            )}

            {/* Messages — meeting transcript style */}
            {displayMessages.map((msg, i) => (
              <div key={msg.id} className="flex gap-3 group">
                {/* Avatar */}
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center border text-lg"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {msg.agentEmoji}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs">{msg.agentName}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 border ${ROLE_COLOR[msg.role] ?? ""}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      {ROLE_LABEL[msg.role] ?? msg.role}
                    </span>
                    {msg.tokensUsed > 0 && (
                      <span className="text-xs opacity-30 ml-auto group-hover:opacity-60 transition-opacity">
                        {msg.tokensUsed.toLocaleString()} tok
                      </span>
                    )}
                    {msg.timestamp && (
                      <span className="text-xs opacity-20 group-hover:opacity-50 transition-opacity">
                        {new Date(msg.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ color: "var(--text)" }}
                  >
                    {msg.content}
                  </div>
                  {/* Divider between messages if different agent */}
                  {i < displayMessages.length - 1 && displayMessages[i + 1].agentId !== msg.agentId && (
                    <div className="mt-4" />
                  )}
                </div>
              </div>
            ))}

            {/* Running thinking indicator */}
            {running && messages.length > 0 && status && (
              <div className="flex items-center gap-2 text-xs opacity-50 pl-12">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {status}
              </div>
            )}

            {/* Meeting Resolution (Final Answer) */}
            {displayFinalAnswer && (
              <div
                className="border-2 p-5 mt-2"
                style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, var(--surface))" }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>
                  ✅ มติที่ประชุม
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
                  {displayFinalAnswer}
                </div>
                {viewingSession && (
                  <button
                    onClick={reuseQuestion}
                    className="mt-4 text-xs px-3 py-1.5 border transition-colors"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    🔄 ประชุมซ้ำในหัวข้อนี้
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Input area — only when not viewing history ── */}
        {!viewingSession && (
          <div
            className="border-t flex-shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {/* Data source config row */}
            {(dataSource !== "none") && (
              <div className="px-5 pt-3 flex items-center gap-2">
                {dataSource === "mcp" && (
                  <input
                    type="url"
                    value={mcpEndpoint}
                    onChange={(e) => setMcpEndpoint(e.target.value)}
                    placeholder="MCP Endpoint: http://localhost:3100/mcp"
                    className="flex-1 px-3 py-1.5 border text-xs bg-transparent focus:outline-none"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                )}
                {dataSource === "database" && (
                  <input
                    type="text"
                    value={dbConnectionString}
                    onChange={(e) => setDbConnectionString(e.target.value)}
                    placeholder="Connection: mysql://user:pass@host:3306/db"
                    className="flex-1 px-3 py-1.5 border text-xs bg-transparent focus:outline-none"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  />
                )}
              </div>
            )}

            {/* Main input row */}
            <div className="flex items-end gap-3 px-5 py-3">
              {/* Data source selector */}
              <select
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                disabled={running}
                className="px-2 py-2 text-xs border bg-transparent focus:outline-none flex-shrink-0"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
                title="Data Source"
              >
                {DATA_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>

              {/* Agenda textarea */}
              <textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
                }}
                disabled={running}
                rows={2}
                placeholder="วาระการประชุม / คำถามสำหรับทีม agents... (Cmd+Enter เพื่อเริ่ม)"
                className="flex-1 min-w-0 px-3 py-2 border text-sm bg-transparent resize-none focus:outline-none"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  lineHeight: "1.5",
                }}
              />

              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {running ? (
                  <button
                    onClick={handleStop}
                    className="px-4 py-2 text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    ⏹ หยุด
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={!agenda.trim() || selectedIds.size === 0}
                    className="px-5 py-2 text-xs font-semibold disabled:opacity-40 transition-all"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    ▶ เริ่มประชุม
                  </button>
                )}
                <div className="text-xs opacity-30 text-center">
                  {selectedIds.size} agents
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
