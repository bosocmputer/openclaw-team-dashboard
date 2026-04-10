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

interface ServerSession {
  id: string;
  question: string;
  status: string;
  startedAt: string;
  totalTokens: number;
  messages: ResearchMessage[];
  finalAnswer?: string;
}

interface AttachedFile {
  filename: string;
  meta: string;
  context: string;
  chars: number;
  size: number;
}

const SUPPORTED_EXTENSIONS = [
  ".xlsx", ".xls", ".xlsm",
  ".pdf",
  ".docx", ".doc",
  ".csv",
  ".json",
  ".txt", ".md", ".log",
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STORAGE_KEY = "research_conversation_v1";

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

  // Conversation state (persisted in localStorage)
  const [rounds, setRounds] = useState<ConversationRound[]>([]);
  const [currentMessages, setCurrentMessages] = useState<ResearchMessage[]>([]);
  const [currentFinalAnswer, setCurrentFinalAnswer] = useState("");
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  // File attachments
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server history
  const [serverSessions, setServerSessions] = useState<ServerSession[]>([]);
  const [viewingSession, setViewingSession] = useState<ServerSession | null>(null);
  const [historyTab, setHistoryTab] = useState<"current" | "history">("current");

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentFinalAnswerRef = useRef("");
  const currentMessagesRef = useRef<ResearchMessage[]>([]);
  const currentSuggestionsRef = useRef<string[]>([]);

  useEffect(() => { currentFinalAnswerRef.current = currentFinalAnswer; }, [currentFinalAnswer]);
  useEffect(() => { currentMessagesRef.current = currentMessages; }, [currentMessages]);
  useEffect(() => { currentSuggestionsRef.current = currentSuggestions; }, [currentSuggestions]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rounds) setRounds(parsed.rounds);
      }
    } catch { /* ignore */ }
  }, []);

  // Save to localStorage when rounds change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rounds }));
    } catch { /* ignore */ }
  }, [rounds]);

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    const activeAgents = (data.agents ?? []).filter((a: Agent) => a.active);
    setAgents(activeAgents);
    setSelectedIds(new Set(activeAgents.map((a: Agent) => a.id)));
  }, []);

  const fetchServerHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/team-research");
      const data = await res.json();
      setServerSessions((data.sessions ?? []).slice(0, 20));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchServerHistory();
  }, [fetchAgents, fetchServerHistory]);

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

  const uploadFile = async (file: File) => {
    setUploadError("");
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setUploadError(`ไม่รองรับไฟล์ประเภท ${ext} — รองรับ: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(`ไฟล์ใหญ่เกิน 10MB (${formatBytes(file.size)})`);
      return;
    }
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/team-research/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAttachedFiles((prev) => [...prev, { filename: data.filename, meta: data.meta, context: data.context, chars: data.chars, size: file.size }]);
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(uploadFile);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  };

  const buildHistory = (): ConversationTurn[] =>
    rounds.map((r) => ({ question: r.question, answer: r.finalAnswer }));

  const handleRun = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || selectedIds.size === 0 || running) return;

    setViewingSession(null);
    setHistoryTab("current");
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
          fileContexts: attachedFiles.length > 0 ? attachedFiles.map(f => ({ filename: f.filename, meta: f.meta, context: f.context })) : undefined,
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
              const t = { inputTokens: payload.inputTokens, outputTokens: payload.outputTokens, totalTokens: payload.totalTokens };
              roundTokens[payload.agentId] = t;
              setAgentTokens((prev) => ({ ...prev, [payload.agentId]: t }));
            } else if ("suggestions" in payload) {
              setCurrentSuggestions(payload.suggestions);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setStatus(`Error: ${e.message}`);
      }
    } finally {
      setRunning(false);
      setRounds((prev) => [
        ...prev,
        {
          question: q,
          messages: currentMessagesRef.current,
          finalAnswer: currentFinalAnswerRef.current,
          agentTokens: roundTokens,
          suggestions: currentSuggestionsRef.current,
        },
      ]);
      setCurrentMessages([]);
      setCurrentFinalAnswer("");
      setCurrentSuggestions([]);
      fetchServerHistory();
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatus("หยุดการทำงาน");
  };

  const loadServerSession = async (session: ServerSession) => {
    try {
      const res = await fetch(`/api/team-research/${session.id}`);
      const data = await res.json();
      if (data.session) {
        setViewingSession(data.session);
        setHistoryTab("history");
      }
    } catch { /* ignore */ }
  };

  const clearSession = () => {
    setRounds([]);
    setCurrentMessages([]);
    setCurrentFinalAnswer("");
    setCurrentSuggestions([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const exportMarkdown = () => {
    const src = viewingSession ? null : rounds;
    if (viewingSession) {
      const lines = [`# Research Session`, `> ${viewingSession.question}`, `> ${new Date(viewingSession.startedAt).toLocaleString("th")}`, ""];
      viewingSession.messages.forEach((m) => {
        if (m.role === "thinking") return;
        lines.push(`### ${m.agentEmoji} ${m.agentName} (${m.role})`, m.content, "");
      });
      if (viewingSession.finalAnswer) lines.push("### ✅ สรุป", viewingSession.finalAnswer, "");
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `research-${Date.now()}.md`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!src || src.length === 0) return;
    const lines = ["# Team Research Session", `> Export: ${new Date().toLocaleString("th")}`, ""];
    src.forEach((r, i) => {
      lines.push(`## รอบที่ ${i + 1}: ${r.question}`, "");
      r.messages.forEach((m) => {
        if (m.role === "thinking") return;
        lines.push(`### ${m.agentEmoji} ${m.agentName} (${m.role})`, m.content, "");
      });
      if (r.finalAnswer) lines.push("### ✅ สรุปคำตอบ", r.finalAnswer, "");
      lines.push("---", "");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `research-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const displayRounds = rounds;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col p-6 gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono" style={{ color: "var(--text)" }}>🔬 Team Research</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              ถามต่อเรื่อย ๆ ได้ — agents จำ context และถกเถียงกันทุกรอบ
            </p>
          </div>
          <div className="flex gap-2">
            {(rounds.length > 0 || viewingSession) && (
              <button onClick={exportMarkdown} className="px-3 py-1.5 rounded-lg text-xs font-mono border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                ⬇ Export
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">

          {/* ── Left sidebar ── */}
          <div className="flex flex-col gap-3 w-64 flex-shrink-0">
            {/* Agent selector */}
            <div className="border rounded-xl p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-mono mb-2 font-bold" style={{ color: "var(--text-muted)" }}>
                Agents ({selectedIds.size}/{agents.length})
              </div>
              {agents.length === 0 ? (
                <div className="text-xs font-mono text-center py-3" style={{ color: "var(--text-muted)" }}>ไม่มี agents</div>
              ) : (
                <div className="space-y-1.5">
                  {agents.map((agent) => {
                    const tokens = agentTokens[agent.id];
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        className="w-full text-left p-2 rounded-lg border transition-all"
                        style={{
                          borderColor: selectedIds.has(agent.id) ? "var(--accent)" : "var(--border)",
                          background: selectedIds.has(agent.id) ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{agent.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono font-bold truncate" style={{ color: "var(--text)" }}>{agent.name}</div>
                            <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{agent.role}</div>
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: selectedIds.has(agent.id) ? "var(--accent)" : "var(--border)" }} />
                        </div>
                        {tokens && (
                          <div className="mt-1 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                            {tokens.totalTokens.toLocaleString()} tokens
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Data source */}
            <div className="border rounded-xl p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-mono mb-1.5" style={{ color: "var(--text-muted)" }}>Data Source</div>
              <select
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                {DATA_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {dataSource === "mcp" && (
                <input type="url" value={mcpEndpoint} onChange={(e) => setMcpEndpoint(e.target.value)} placeholder="http://localhost:3100/mcp" className="w-full mt-2 px-2 py-1.5 rounded-lg border text-xs font-mono outline-none" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              )}
              {dataSource === "database" && (
                <input type="text" value={dbConnectionString} onChange={(e) => setDbConnectionString(e.target.value)} placeholder="mysql://user:pass@host/db" className="w-full mt-2 px-2 py-1.5 rounded-lg border text-xs font-mono outline-none" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              )}
            </div>

            {/* File Attachment Panel */}
            <div
              className="border rounded-xl p-3"
              style={{ borderColor: isDragOver ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono font-bold" style={{ color: "var(--text-muted)" }}>
                  📎 แนบไฟล์อ้างอิง ({attachedFiles.length})
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="text-xs font-mono px-2 py-1 rounded-lg border transition-all disabled:opacity-40"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  {uploadingFile ? "⏳" : "+ แนบ"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={SUPPORTED_EXTENSIONS.join(",")}
                  onChange={handleFileInput}
                  className="hidden"
                  aria-label="แนบไฟล์อ้างอิง"
                />
              </div>

              {/* Drop zone hint */}
              {attachedFiles.length === 0 && !uploadingFile && (
                <div
                  className="border-2 border-dashed rounded-lg p-3 text-center text-xs font-mono transition-all"
                  style={{ borderColor: isDragOver ? "var(--accent)" : "var(--border)", color: "var(--text-muted)", background: isDragOver ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent" }}
                >
                  {isDragOver ? "ปล่อยไฟล์เลย!" : "Drag & Drop หรือกด + แนบ"}
                  <div className="mt-1 opacity-60">xlsx · pdf · docx · csv · json · txt · md</div>
                </div>
              )}

              {uploadError && (
                <div className="mt-1 text-xs font-mono text-red-400">{uploadError}</div>
              )}

              {/* Attached files list */}
              {attachedFiles.length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {attachedFiles.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg border" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <span className="text-sm flex-shrink-0">
                        {f.filename.endsWith(".xlsx") || f.filename.endsWith(".xls") || f.filename.endsWith(".csv") ? "📊" :
                         f.filename.endsWith(".pdf") ? "📄" :
                         f.filename.endsWith(".docx") || f.filename.endsWith(".doc") ? "📝" : "📋"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-bold truncate" style={{ color: "var(--text)" }}>{f.filename}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                          {formatBytes(f.size)} · {f.chars.toLocaleString()} chars
                        </div>
                      </div>
                      <button
                        onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-xs opacity-40 hover:opacity-100 flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setAttachedFiles([])}
                    className="w-full text-[10px] font-mono py-1 rounded border"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    ลบทั้งหมด
                  </button>
                </div>
              )}
            </div>

            {/* History panel — tabs */}
            <div className="border rounded-xl flex-1 flex flex-col overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {/* Tab bar */}
              <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={() => { setHistoryTab("current"); setViewingSession(null); }}
                  className="flex-1 py-2 text-xs font-mono transition-all"
                  style={{ color: historyTab === "current" ? "var(--accent)" : "var(--text-muted)", borderBottom: historyTab === "current" ? "2px solid var(--accent)" : "2px solid transparent" }}
                >
                  💬 Session ({rounds.length})
                </button>
                <button
                  onClick={() => setHistoryTab("history")}
                  className="flex-1 py-2 text-xs font-mono transition-all"
                  style={{ color: historyTab === "history" ? "var(--accent)" : "var(--text-muted)", borderBottom: historyTab === "history" ? "2px solid var(--accent)" : "2px solid transparent" }}
                >
                  📋 History ({serverSessions.length})
                </button>
              </div>

              {historyTab === "current" ? (
                <div className="p-3 flex-1 overflow-y-auto">
                  {rounds.length === 0 ? (
                    <div className="text-xs font-mono text-center py-4" style={{ color: "var(--text-muted)" }}>
                      ยังไม่มีการสนทนา
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rounds.map((r, i) => (
                        <div key={i} className="text-xs font-mono p-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                          <div className="font-bold mb-0.5" style={{ color: "var(--text)" }}>รอบที่ {i + 1}</div>
                          <div className="line-clamp-2" style={{ color: "var(--text-muted)" }}>{r.question}</div>
                        </div>
                      ))}
                      <button onClick={clearSession} className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border mt-1" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                        🗑 เริ่ม session ใหม่
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 flex-1 overflow-y-auto">
                  {serverSessions.length === 0 ? (
                    <div className="text-xs font-mono text-center py-4" style={{ color: "var(--text-muted)" }}>ไม่มีประวัติ</div>
                  ) : (
                    <div className="space-y-2">
                      {serverSessions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => loadServerSession(s)}
                          className="w-full text-left p-2 rounded-lg border transition-all"
                          style={{
                            borderColor: viewingSession?.id === s.id ? "var(--accent)" : "var(--border)",
                            background: viewingSession?.id === s.id ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                          }}
                        >
                          <div className="text-xs font-mono line-clamp-2" style={{ color: "var(--text)" }}>{s.question}</div>
                          <div className="text-[10px] font-mono mt-1" style={{ color: "var(--text-muted)" }}>
                            {s.status === "completed" ? "✅" : s.status === "error" ? "❌" : "⏳"}{" "}
                            {new Date(s.startedAt).toLocaleDateString("th")}
                            {s.totalTokens > 0 && ` · ${s.totalTokens.toLocaleString()} tokens`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Main panel ── */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">

            {/* Viewing server session banner */}
            {viewingSession && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-mono" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)", color: "var(--text-muted)" }}>
                <span style={{ color: "var(--accent)" }}>📋 ดูประวัติ</span>
                <span className="flex-1 truncate">{viewingSession.question}</span>
                <button
                  onClick={() => { setViewingSession(null); setHistoryTab("current"); }}
                  className="ml-2 px-2 py-0.5 rounded border opacity-60 hover:opacity-100"
                  style={{ borderColor: "var(--border)" }}
                >
                  ✕ ปิด
                </button>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto space-y-6 min-h-[300px]">

              {/* Empty state */}
              {!viewingSession && displayRounds.length === 0 && currentMessages.length === 0 && !running && (
                <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--text-muted)" }}>
                  ส่งคำถามเพื่อเริ่มต้น — agents จะวิเคราะห์และถกเถียงกัน<br />
                  <span className="text-xs opacity-60">ถามต่อเรื่อย ๆ ได้ agents จำ context ทุกรอบ · refresh ก็ไม่หาย</span>
                </div>
              )}

              {/* Viewing server session */}
              {viewingSession && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-mono" style={{ background: "var(--accent)", color: "#000" }}>
                      {viewingSession.question}
                    </div>
                  </div>
                  {viewingSession.messages.map((msg) => (
                    <div key={msg.id} className={`border rounded-xl p-4 ${ROLE_COLOR[msg.role] ?? ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{msg.agentEmoji}</span>
                        <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>{msg.agentName}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                          {ROLE_LABEL[msg.role] ?? msg.role}
                        </span>
                      </div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{msg.content}</div>
                    </div>
                  ))}
                  {viewingSession.finalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>✅ คำตอบสุดท้าย</div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{viewingSession.finalAnswer}</div>
                      <button
                        onClick={() => { setViewingSession(null); setHistoryTab("current"); setQuestion(viewingSession.question); }}
                        className="mt-3 text-xs font-mono px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        🔄 ถามคำถามนี้อีกครั้ง
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Current session rounds */}
              {!viewingSession && displayRounds.map((round, roundIndex) => (
                <div key={roundIndex} className="space-y-3">
                  {/* Round separator */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <div className="text-xs font-mono px-3 py-1 rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                      รอบที่ {roundIndex + 1}
                    </div>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                  </div>

                  {/* Question bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-mono" style={{ background: "var(--accent)", color: "#000" }}>
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
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{msg.tokensUsed.toLocaleString()} tokens</span>
                        )}
                      </div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{msg.content}</div>
                    </div>
                  ))}

                  {/* Final answer */}
                  {round.finalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>✅ คำตอบสุดท้าย</div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{round.finalAnswer}</div>
                    </div>
                  )}

                  {/* Follow-up suggestions — only last round when idle */}
                  {roundIndex === displayRounds.length - 1 && round.suggestions.length > 0 && !running && currentMessages.length === 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>💡 คำถามต่อเนื่อง:</div>
                      <div className="flex flex-col gap-1.5">
                        {round.suggestions.map((s, i) => (
                          <button key={i} onClick={() => handleRun(s)} disabled={running} className="text-left px-3 py-2 rounded-lg border text-xs font-mono transition-all hover:opacity-80 disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}>
                            → {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Current round in progress */}
              {!viewingSession && (currentMessages.length > 0 || running) && (
                <div className="space-y-3">
                  {displayRounds.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                      <div className="text-xs font-mono px-3 py-1 rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                        รอบที่ {displayRounds.length + 1}
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
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{msg.tokensUsed.toLocaleString()} tokens</span>
                        )}
                      </div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{msg.content}</div>
                    </div>
                  ))}
                  {currentFinalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>✅ คำตอบสุดท้าย</div>
                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{currentFinalAnswer}</div>
                    </div>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input box */}
            {!viewingSession && (
              <div className="border rounded-xl p-4 flex-shrink-0" style={{ borderColor: running ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
                  disabled={running}
                  rows={2}
                  placeholder={rounds.length > 0 ? "ถามต่อเลย... agents จำ context ทุกรอบ · refresh ก็ไม่หาย (Cmd+Enter)" : "พิมพ์คำถาม... (Cmd+Enter เพื่อส่ง)"}
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
                      <button onClick={handleStop} className="px-4 py-1.5 rounded-lg text-xs font-mono border border-red-500/30 text-red-400">
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
