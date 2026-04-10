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
  useWebSearch?: boolean;
  seniority?: number;
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

interface ChartData {
  type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

interface ConversationRound {
  question: string;
  messages: ResearchMessage[];
  finalAnswer: string;
  agentTokens: Record<string, AgentTokenState>;
  suggestions: string[];
  chartData?: ChartData;
  chairmanId?: string;
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
  sheets?: string[]; // available sheets for Excel
  selectedSheets?: string[]; // sheets to inject
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
  finding: "📋 นำเสนอ",
  analysis: "📊 วิเคราะห์",
  synthesis: "🏛️ มติประธาน",
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

const HISTORY_MODES = [
  { id: "full", label: "Full — จำทุกรอบ" },
  { id: "last3", label: "Last 3 — จำ 3 รอบล่าสุด" },
  { id: "summary", label: "Summary — สรุปย่อ (ประหยัด token)" },
  { id: "none", label: "None — ไม่จำ (ประหยัดสุด)" },
];

// Simple bar chart renderer (no external lib)
function SimpleBarChart({ data }: { data: ChartData }) {
  const allValues = data.datasets.flatMap((d) => d.data);
  const max = Math.max(...allValues, 1);
  const colors = ["var(--accent)", "#60a5fa", "#34d399", "#f472b6", "#fb923c"];

  return (
    <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-xs font-mono font-bold mb-3" style={{ color: "var(--accent)" }}>📊 {data.title}</div>
      {data.type === "pie" ? (
        // Simple pie-like display as percentage bars
        <div className="space-y-2">
          {data.labels.map((label, i) => {
            const val = data.datasets[0]?.data[i] ?? 0;
            const pct = Math.round((val / (allValues.reduce((a, b) => a + b, 0) || 1)) * 100);
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="text-xs font-mono w-24 truncate" style={{ color: "var(--text-muted)" }}>{label}</div>
                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                </div>
                <div className="text-xs font-mono w-10 text-right" style={{ color: "var(--text)" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      ) : (
        // Bar/Line chart
        <div className="space-y-1">
          {data.datasets.map((dataset, di) => (
            <div key={di} className="space-y-1.5">
              {dataset.label && (
                <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{dataset.label}</div>
              )}
              {data.labels.map((label, i) => {
                const val = dataset.data[i] ?? 0;
                const pct = Math.round((val / max) * 100);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="text-xs font-mono w-28 truncate text-right" style={{ color: "var(--text-muted)" }}>{label}</div>
                    <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "var(--bg)" }}>
                      <div className="h-full rounded flex items-center px-2 transition-all" style={{ width: `${Math.max(pct, 2)}%`, background: colors[di % colors.length] }}>
                        <span className="text-[10px] font-mono text-white truncate">{val.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Render message content — strip ```chart blocks
function MessageContent({ content }: { content: string }) {
  const stripped = content.replace(/```chart\n[\s\S]*?\n```/g, "").trim();
  return (
    <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
      {stripped}
    </div>
  );
}

// Meeting Minutes export
function buildMinutesMarkdown(rounds: ConversationRound[], agents: Agent[]): string {
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));
  const lines: string[] = [
    "# รายงานการประชุม (Meeting Minutes)",
    `> วันที่: ${new Date().toLocaleString("th-TH")}`,
    "",
  ];

  rounds.forEach((round, i) => {
    lines.push(`---`, `## วาระที่ ${i + 1}: ${round.question}`, "");

    if (round.chairmanId) {
      const ch = agentMap[round.chairmanId];
      if (ch) lines.push(`**ประธานที่ประชุม:** ${ch.emoji} ${ch.name} (${ch.role})`, "");
    }

    // Phase 1 — presentations
    const findings = round.messages.filter((m) => m.role === "finding");
    if (findings.length > 0) {
      lines.push("### 📋 ความเห็นจากที่ประชุม", "");
      findings.forEach((m) => {
        lines.push(`#### ${m.agentEmoji} ${m.agentName} (${m.role})`, m.content, "");
      });
    }

    // Phase 2 — discussion
    const chats = round.messages.filter((m) => m.role === "chat");
    if (chats.length > 0) {
      lines.push("### 💬 อภิปราย", "");
      chats.forEach((m) => {
        lines.push(`#### ${m.agentEmoji} ${m.agentName}`, m.content, "");
      });
    }

    // Phase 3 — synthesis/resolution
    if (round.finalAnswer) {
      lines.push("### 🏛️ มติที่ประชุม", round.finalAnswer.replace(/```chart\n[\s\S]*?\n```/g, "").trim(), "");
    }

    // Token summary
    const totalTokens = Object.values(round.agentTokens).reduce((s, t) => s + t.totalTokens, 0);
    if (totalTokens > 0) {
      lines.push(`> Token รวม: ${totalTokens.toLocaleString()}`, "");
    }
  });

  return lines.join("\n");
}

export default function ResearchPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [dataSource, setDataSource] = useState("none");
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  const [dbConnectionString, setDbConnectionString] = useState("");
  const [historyMode, setHistoryMode] = useState<"full" | "last3" | "summary" | "none">("last3");
  const [running, setRunning] = useState(false);
  const [agentTokens, setAgentTokens] = useState<Record<string, AgentTokenState>>({});
  const [status, setStatus] = useState("");
  const [chairmanId, setChairmanId] = useState<string | null>(null);
  const [searchingAgents, setSearchingAgents] = useState<Set<string>>(new Set());

  // Conversation state (persisted in localStorage)
  const [rounds, setRounds] = useState<ConversationRound[]>([]);
  const [currentMessages, setCurrentMessages] = useState<ResearchMessage[]>([]);
  const [currentFinalAnswer, setCurrentFinalAnswer] = useState("");
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);
  const [currentChartData, setCurrentChartData] = useState<ChartData | null>(null);

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
  const currentChartDataRef = useRef<ChartData | null>(null);
  const chairmanIdRef = useRef<string | null>(null);

  useEffect(() => { currentFinalAnswerRef.current = currentFinalAnswer; }, [currentFinalAnswer]);
  useEffect(() => { currentMessagesRef.current = currentMessages; }, [currentMessages]);
  useEffect(() => { currentSuggestionsRef.current = currentSuggestions; }, [currentSuggestions]);
  useEffect(() => { currentChartDataRef.current = currentChartData; }, [currentChartData]);
  useEffect(() => { chairmanIdRef.current = chairmanId; }, [chairmanId]);

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
      setUploadError(`ไม่รองรับไฟล์ประเภท ${ext}`);
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
      // Parse available sheets for Excel files
      const sheets: string[] = [];
      if (data.meta && data.meta.includes("sheets:")) {
        const match = data.meta.match(/sheets: (.+)$/);
        if (match) sheets.push(...match[1].split(", ").map((s: string) => s.trim()));
      }
      setAttachedFiles((prev) => [...prev, {
        filename: data.filename,
        meta: data.meta,
        context: data.context,
        chars: data.chars,
        size: file.size,
        sheets: sheets.length > 0 ? sheets : undefined,
        selectedSheets: sheets.length > 0 ? sheets : undefined,
      }]);
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

  const toggleSheet = (fileIdx: number, sheet: string) => {
    setAttachedFiles((prev) => prev.map((f, i) => {
      if (i !== fileIdx) return f;
      const sel = f.selectedSheets ?? [];
      return {
        ...f,
        selectedSheets: sel.includes(sheet) ? sel.filter((s) => s !== sheet) : [...sel, sheet],
      };
    }));
  };

  const buildHistory = (): ConversationTurn[] =>
    rounds.map((r) => ({ question: r.question, answer: r.finalAnswer }));

  const buildFileContexts = () =>
    attachedFiles.length > 0
      ? attachedFiles.map((f) => ({
          filename: f.filename,
          meta: f.meta,
          context: f.context,
          sheets: f.selectedSheets,
        }))
      : undefined;

  const handleRun = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || selectedIds.size === 0 || running) return;

    setViewingSession(null);
    setHistoryTab("current");
    setRunning(true);
    setCurrentMessages([]);
    setCurrentFinalAnswer("");
    setCurrentSuggestions([]);
    setCurrentChartData(null);
    setAgentTokens({});
    setStatus("");
    setChairmanId(null);
    setSearchingAgents(new Set());
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
          fileContexts: buildFileContexts(),
          historyMode,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));

            if (currentEvent === "status" || ("message" in payload && typeof payload.message === "string")) {
              setStatus(payload.message);
            } else if (currentEvent === "chairman") {
              setChairmanId(payload.agentId);
              chairmanIdRef.current = payload.agentId;
            } else if (currentEvent === "agent_searching") {
              setSearchingAgents((prev) => new Set([...prev, payload.agentId]));
            } else if (currentEvent === "message" || ("content" in payload && "agentId" in payload)) {
              setSearchingAgents((prev) => { const n = new Set(prev); n.delete(payload.agentId); return n; });
              setCurrentMessages((prev) => [...prev, payload as ResearchMessage]);
            } else if (currentEvent === "final_answer" || ("content" in payload && !("agentId" in payload))) {
              setCurrentFinalAnswer(payload.content);
            } else if (currentEvent === "agent_tokens" || ("inputTokens" in payload)) {
              const t = { inputTokens: payload.inputTokens, outputTokens: payload.outputTokens, totalTokens: payload.totalTokens };
              roundTokens[payload.agentId] = t;
              setAgentTokens((prev) => ({ ...prev, [payload.agentId]: t }));
            } else if (currentEvent === "follow_up_suggestions" || "suggestions" in payload) {
              setCurrentSuggestions(payload.suggestions);
            } else if (currentEvent === "chart_data") {
              setCurrentChartData(payload);
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
      setSearchingAgents(new Set());
      setRounds((prev) => [
        ...prev,
        {
          question: q,
          messages: currentMessagesRef.current,
          finalAnswer: currentFinalAnswerRef.current,
          agentTokens: roundTokens,
          suggestions: currentSuggestionsRef.current,
          chartData: currentChartDataRef.current ?? undefined,
          chairmanId: chairmanIdRef.current ?? undefined,
        },
      ]);
      setCurrentMessages([]);
      setCurrentFinalAnswer("");
      setCurrentSuggestions([]);
      setCurrentChartData(null);
      setChairmanId(null);
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

  const exportMinutes = () => {
    if (viewingSession) {
      const lines = [
        "# รายงานการประชุม (Meeting Minutes)",
        `> ${viewingSession.question}`,
        `> ${new Date(viewingSession.startedAt).toLocaleString("th-TH")}`,
        "",
        "### ความเห็นจากที่ประชุม",
        "",
      ];
      viewingSession.messages.forEach((m) => {
        if (m.role === "thinking") return;
        lines.push(`#### ${m.agentEmoji} ${m.agentName} (${ROLE_LABEL[m.role] ?? m.role})`, m.content, "");
      });
      if (viewingSession.finalAnswer) lines.push("### 🏛️ มติที่ประชุม", viewingSession.finalAnswer, "");
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `minutes-${Date.now()}.md`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (rounds.length === 0) return;
    const md = buildMinutesMarkdown(rounds, agents);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `minutes-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const displayRounds = rounds;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col p-6 gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono" style={{ color: "var(--text)" }}>🏛️ Meeting Room</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              ห้องประชุม AI — ประธานนำทีมถกเถียงและสรุปมติทุกวาระ
            </p>
          </div>
          <div className="flex gap-2">
            {(rounds.length > 0 || viewingSession) && (
              <button onClick={exportMinutes} className="px-3 py-1.5 rounded-lg text-xs font-mono border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                📄 Export Minutes
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
                สมาชิกที่ประชุม ({selectedIds.size}/{agents.length})
              </div>
              {agents.length === 0 ? (
                <div className="text-xs font-mono text-center py-3" style={{ color: "var(--text-muted)" }}>ไม่มี agents</div>
              ) : (
                <div className="space-y-1.5">
                  {agents.map((agent) => {
                    const tokens = agentTokens[agent.id];
                    const isChairman = agent.id === chairmanId;
                    const isSearching = searchingAgents.has(agent.id);
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
                            <div className="flex items-center gap-1">
                              <div className="text-xs font-mono font-bold truncate" style={{ color: "var(--text)" }}>{agent.name}</div>
                              {isChairman && <span className="text-[9px] px-1 rounded font-mono" style={{ background: "var(--accent)", color: "#000" }}>ประธาน</span>}
                              {agent.useWebSearch && <span className="text-[9px]" title="Web Search">🔍</span>}
                            </div>
                            <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{agent.role}</div>
                          </div>
                          {isSearching ? (
                            <span className="text-[9px] font-mono animate-pulse" style={{ color: "var(--accent)" }}>ค้นหา...</span>
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: selectedIds.has(agent.id) ? "var(--accent)" : "var(--border)" }} />
                          )}
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

            {/* History Mode + Data Source */}
            <div className="border rounded-xl p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-mono mb-1 font-bold" style={{ color: "var(--text-muted)" }}>🧠 Context Memory</div>
              <select
                value={historyMode}
                onChange={(e) => setHistoryMode(e.target.value as typeof historyMode)}
                className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono mb-2"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                {HISTORY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>

              <div className="text-xs font-mono mb-1 font-bold" style={{ color: "var(--text-muted)" }}>Data Source</div>
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
                  📎 เอกสารอ้างอิง ({attachedFiles.length})
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

              {attachedFiles.length === 0 && !uploadingFile && (
                <div
                  className="border-2 border-dashed rounded-lg p-3 text-center text-xs font-mono transition-all"
                  style={{ borderColor: isDragOver ? "var(--accent)" : "var(--border)", color: "var(--text-muted)", background: isDragOver ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent" }}
                >
                  {isDragOver ? "ปล่อยไฟล์เลย!" : "Drag & Drop หรือกด + แนบ"}
                  <div className="mt-1 opacity-60">xlsx · pdf · docx · csv · json · txt</div>
                </div>
              )}

              {uploadError && <div className="mt-1 text-xs font-mono text-red-400">{uploadError}</div>}

              {attachedFiles.length > 0 && (
                <div className="space-y-2 mt-1">
                  {attachedFiles.map((f, i) => (
                    <div key={i} className="p-2 rounded-lg border" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="flex items-start gap-2">
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
                          aria-label="ลบไฟล์"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ✕
                        </button>
                      </div>
                      {/* Sheet selector for Excel */}
                      {f.sheets && f.sheets.length > 1 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-mono mb-1" style={{ color: "var(--text-muted)" }}>เลือก Sheet:</div>
                          <div className="flex flex-wrap gap-1">
                            {f.sheets.map((sheet) => {
                              const selected = f.selectedSheets?.includes(sheet) ?? true;
                              return (
                                <button
                                  key={sheet}
                                  onClick={() => toggleSheet(i, sheet)}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all"
                                  style={{
                                    borderColor: selected ? "var(--accent)" : "var(--border)",
                                    background: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                                    color: selected ? "var(--accent)" : "var(--text-muted)",
                                  }}
                                >
                                  {sheet}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
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

            {/* History panel */}
            <div className="border rounded-xl flex-1 flex flex-col overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={() => { setHistoryTab("current"); setViewingSession(null); }}
                  className="flex-1 py-2 text-xs font-mono transition-all"
                  style={{ color: historyTab === "current" ? "var(--accent)" : "var(--text-muted)", borderBottom: historyTab === "current" ? "2px solid var(--accent)" : "2px solid transparent" }}
                >
                  💬 วาระ ({rounds.length})
                </button>
                <button
                  onClick={() => setHistoryTab("history")}
                  className="flex-1 py-2 text-xs font-mono transition-all"
                  style={{ color: historyTab === "history" ? "var(--accent)" : "var(--text-muted)", borderBottom: historyTab === "history" ? "2px solid var(--accent)" : "2px solid transparent" }}
                >
                  📋 ประวัติ ({serverSessions.length})
                </button>
              </div>

              {historyTab === "current" ? (
                <div className="p-3 flex-1 overflow-y-auto">
                  {rounds.length === 0 ? (
                    <div className="text-xs font-mono text-center py-4" style={{ color: "var(--text-muted)" }}>ยังไม่มีวาระ</div>
                  ) : (
                    <div className="space-y-2">
                      {rounds.map((r, i) => (
                        <div key={i} className="text-xs font-mono p-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                          <div className="font-bold mb-0.5" style={{ color: "var(--text)" }}>วาระที่ {i + 1}</div>
                          <div className="line-clamp-2" style={{ color: "var(--text-muted)" }}>{r.question}</div>
                        </div>
                      ))}
                      <button onClick={clearSession} className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border mt-1" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                        🗑 เริ่มการประชุมใหม่
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
                  🏛️ ห้องประชุมพร้อมแล้ว — พิมพ์วาระแรกเพื่อเริ่มประชุม<br />
                  <span className="text-xs opacity-60">ประธานจะถูกเลือกอัตโนมัติจาก Role · agents จำ context ทุกวาระ</span>
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
                      <MessageContent content={msg.content} />
                    </div>
                  ))}
                  {viewingSession.finalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>🏛️ มติที่ประชุม</div>
                      <MessageContent content={viewingSession.finalAnswer} />
                      <button
                        onClick={() => { setViewingSession(null); setHistoryTab("current"); setQuestion(viewingSession.question); }}
                        className="mt-3 text-xs font-mono px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        🔄 นำวาระนี้กลับมาประชุมอีกครั้ง
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Current session rounds */}
              {!viewingSession && displayRounds.map((round, roundIndex) => (
                <div key={roundIndex} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <div className="text-xs font-mono px-3 py-1 rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                      วาระที่ {roundIndex + 1}
                    </div>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-mono" style={{ background: "var(--accent)", color: "#000" }}>
                      {round.question}
                    </div>
                  </div>

                  {round.messages.map((msg) => (
                    <div key={msg.id} className={`border rounded-xl p-4 ${ROLE_COLOR[msg.role] ?? ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{msg.agentEmoji}</span>
                        <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>{msg.agentName}</span>
                        {round.chairmanId === msg.agentId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ background: "var(--accent)", color: "#000" }}>ประธาน</span>
                        )}
                        <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                          {ROLE_LABEL[msg.role] ?? msg.role}
                        </span>
                        {msg.tokensUsed > 0 && (
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{msg.tokensUsed.toLocaleString()} tokens</span>
                        )}
                      </div>
                      <MessageContent content={msg.content} />
                    </div>
                  ))}

                  {round.finalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>🏛️ มติที่ประชุม</div>
                      <MessageContent content={round.finalAnswer} />
                      {round.chartData && <SimpleBarChart data={round.chartData} />}
                    </div>
                  )}

                  {roundIndex === displayRounds.length - 1 && round.suggestions.length > 0 && !running && currentMessages.length === 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>💡 วาระต่อเนื่องที่แนะนำ:</div>
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
                        วาระที่ {displayRounds.length + 1}
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
                        {chairmanId === msg.agentId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ background: "var(--accent)", color: "#000" }}>ประธาน</span>
                        )}
                        <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                          {ROLE_LABEL[msg.role] ?? msg.role}
                        </span>
                        {msg.tokensUsed > 0 && (
                          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>{msg.tokensUsed.toLocaleString()} tokens</span>
                        )}
                      </div>
                      <MessageContent content={msg.content} />
                    </div>
                  ))}
                  {currentFinalAnswer && (
                    <div className="border-2 rounded-xl p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                      <div className="font-mono font-bold text-sm mb-3" style={{ color: "var(--accent)" }}>🏛️ มติที่ประชุม</div>
                      <MessageContent content={currentFinalAnswer} />
                      {currentChartData && <SimpleBarChart data={currentChartData} />}
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
                  placeholder={rounds.length > 0 ? "พิมพ์วาระต่อไป... agents จำ context · Cmd+Enter" : "พิมพ์วาระแรก... (Cmd+Enter เพื่อเปิดประชุม)"}
                  className="w-full bg-transparent font-mono text-sm resize-none outline-none"
                  style={{ color: "var(--text)" }}
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {rounds.length > 0 && <span style={{ color: "var(--accent)" }}>{rounds.length} วาระ · </span>}
                    {selectedIds.size} สมาชิก · {historyMode} mode
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
                      {running ? "กำลังประชุม..." : "🏛️ เปิดวาระ"}
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
