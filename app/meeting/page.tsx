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

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#E06B2E",
  openai: "#10A37F",
  gemini: "#4285F4",
  ollama: "#7C3AED",
  openrouter: "#FF6B6B",
  custom: "#F59E0B",
};

const CANVAS_HEIGHT = 320;

// ─── Canvas Drawing ───────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFloor(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const tile = 20;
  for (let y = 0; y <= H; y += tile) {
    for (let x = 0; x <= W; x += tile) {
      const even = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      ctx.fillStyle = even ? "#111122" : "#161630";
      ctx.fillRect(x, y, tile, tile);
    }
  }
  ctx.strokeStyle = "#1c1c38";
  ctx.lineWidth = 0.5;
  for (let y = 0; y <= H; y += tile) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x <= W; x += tile) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
}

function drawConferenceTable(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rw: number, rh: number,
) {
  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, rw, rh, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2a1406";
  ctx.fill();
  ctx.restore();

  // Table edge
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2a1406";
  ctx.fill();

  // Surface gradient
  const grad = ctx.createRadialGradient(cx - rw * 0.3, cy - rh * 0.4, rw * 0.05, cx, cy, rw);
  grad.addColorStop(0, "#7a5030");
  grad.addColorStop(0.45, "#5c381a");
  grad.addColorStop(1, "#2a1406");
  ctx.beginPath();
  ctx.ellipse(cx, cy - 3, rw - 5, rh - 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Wood grain lines
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy - 3, rw - 5, rh - 5, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + i * 14, cy - 3, rw * 0.35, (rh - 5) * 0.55, 0.08 * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Highlight glare
  ctx.beginPath();
  ctx.ellipse(cx - rw * 0.22, cy - rh * 0.38, rw * 0.28, rh * 0.14, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
}

function drawChairAt(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, angle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Seat
  ctx.fillStyle = "#252c3a";
  roundRectPath(ctx, -8, -6, 16, 12, 3);
  ctx.fill();
  ctx.strokeStyle = "#3d4a60";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Backrest
  ctx.fillStyle = "#2e3848";
  roundRectPath(ctx, -7, -13, 14, 6, 2);
  ctx.fill();
  ctx.strokeStyle = "#3d4a60";
  ctx.stroke();
  ctx.restore();
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number, tipY: number, text: string, canvasW: number,
) {
  const maxW = 160;
  const padding = 7;
  ctx.font = "9px 'Courier New', monospace";

  const words = text.replace(/\n/g, " ").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW - padding * 2) {
      if (line) lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  const show = lines.slice(-3);

  const lh = 12;
  const textW = Math.max(...show.map((l) => ctx.measureText(l).width));
  const bw = Math.min(maxW, textW + padding * 2);
  const bh = show.length * lh + padding * 2;
  let bx = x - bw / 2;
  const by = tipY - bh - 10;
  bx = Math.max(4, Math.min(canvasW - bw - 4, bx));

  ctx.fillStyle = "rgba(20,22,45,0.94)";
  roundRectPath(ctx, bx, by, bw, bh, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(80,100,200,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 5, tipY - 10);
  ctx.lineTo(x + 5, tipY - 10);
  ctx.lineTo(x, tipY - 2);
  ctx.fillStyle = "rgba(20,22,45,0.94)";
  ctx.fill();

  ctx.fillStyle = "#c8d4f0";
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  show.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padding + i * lh));
}

function drawThinkingBubble(
  ctx: CanvasRenderingContext2D,
  x: number, tipY: number, time: number,
) {
  const r = 15;
  const cy = tipY - r - 6;
  ctx.fillStyle = "rgba(20,22,45,0.92)";
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(80,100,200,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 4, tipY - 4);
  ctx.lineTo(x + 4, tipY - 4);
  ctx.lineTo(x, tipY - 1);
  ctx.fillStyle = "rgba(20,22,45,0.92)";
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const bounce = 0.5 + 0.5 * Math.sin(time * 0.004 + i * 1.1);
    ctx.fillStyle = `rgba(150,170,255,${0.4 + bounce * 0.6})`;
    ctx.beginPath();
    ctx.arc(x - 6 + i * 6, cy - bounce * 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAgentAvatar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  emoji: string, name: string, provider: string,
  isActive: boolean, time: number,
  lastMsg: string | null, canvasW: number,
) {
  const r = 22;
  const color = PROVIDER_COLORS[provider?.toLowerCase()] ?? "#6B7280";

  if (isActive) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
    ctx.beginPath();
    ctx.arc(x, y, r + 10 + pulse * 6, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.12 + pulse * 0.18);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, isActive ? 0.85 : 0.55);
  ctx.fill();
  ctx.strokeStyle = isActive ? color : hexToRgba(color, 0.7);
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.stroke();

  ctx.font = `${Math.round(r * 0.85)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y + 1);

  ctx.font = `bold 8px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = isActive ? "#fff" : "#9ca3af";
  const displayName = name.length > 9 ? name.slice(0, 9) + "…" : name;
  ctx.fillText(displayName, x, y + r + 5);

  if (isActive) {
    if (lastMsg) drawSpeechBubble(ctx, x, y - r - 8, lastMsg, canvasW);
    else drawThinkingBubble(ctx, x, y - r - 8, time);
  }
}

function drawMeetingRoomScene(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  visibleAgents: Array<{ id: string; emoji: string; name: string; provider: string }>,
  activeAgentId: string | null,
  time: number,
  agentLastMsg: Record<string, string>,
  currentAgenda: string,
) {
  drawFloor(ctx, W, H);

  // Top wall + baseboard
  ctx.fillStyle = "#0c0d1a";
  ctx.fillRect(0, 0, W, 28);
  ctx.fillStyle = "#18183a";
  ctx.fillRect(0, 28, W, 3);

  // Room label
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (currentAgenda) {
    ctx.fillStyle = "rgba(110,130,210,0.75)";
    const label = currentAgenda.length > 60 ? currentAgenda.slice(0, 60) + "…" : currentAgenda;
    ctx.fillText("📋 " + label, W / 2, 15);
  } else {
    ctx.fillStyle = "rgba(70,80,140,0.5)";
    ctx.fillText("🏛  MEETING ROOM", W / 2, 15);
  }

  const cx = W / 2;
  const cy = H * 0.5;
  const rw = Math.min(W * 0.21, 125);
  const rh = Math.min(H * 0.22, 58);
  const seatRx = rw + 58;
  const seatRy = rh + 50;
  const n = visibleAgents.length;

  // Chairs (behind agents)
  if (n > 0) {
    visibleAgents.forEach((_, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ax = cx + Math.cos(angle) * seatRx;
      const ay = cy + Math.sin(angle) * seatRy;
      drawChairAt(ctx, ax, ay + 8, angle + Math.PI / 2);
    });
  }

  // Conference table
  drawConferenceTable(ctx, cx, cy, rw, rh);

  // Center phone LED
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#17182e";
  ctx.fill();
  ctx.strokeStyle = "#2d374d";
  ctx.lineWidth = 1;
  ctx.stroke();
  const led = 0.5 + 0.5 * Math.sin(time * 0.002);
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = activeAgentId
    ? `rgba(52,211,153,${0.5 + led * 0.5})`
    : "rgba(90,90,140,0.45)";
  ctx.fill();

  // Agents
  if (n === 0) {
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = "rgba(70,80,140,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ยังไม่มี agents — ไปที่ /agents เพื่อเพิ่ม", W / 2, cy);
  } else {
    visibleAgents.forEach((agent, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ax = cx + Math.cos(angle) * seatRx;
      const ay = cy + Math.sin(angle) * seatRy;
      const isActive = agent.id === activeAgentId;
      const lastMsg = isActive ? (agentLastMsg[agent.id] ?? null) : null;
      drawAgentAvatar(ctx, ax, ay, agent.emoji, agent.name, agent.provider, isActive, time, lastMsg, W);
    });
  }
}

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

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const agentLastMsgRef = useRef<Record<string, string>>({});
  const agentsRef = useRef(agents);
  const selectedIdsRef = useRef(selectedIds);
  const activeAgentIdRef = useRef(activeAgentId);
  const viewingSessionRef = useRef(viewingSession);
  const currentAgendaRef = useRef("");

  // ─── Sync refs ──────────────────────────────────────────────────────────────
  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { activeAgentIdRef.current = activeAgentId; }, [activeAgentId]);
  useEffect(() => { viewingSessionRef.current = viewingSession; }, [viewingSession]);
  useEffect(() => { currentAgendaRef.current = agenda; }, [agenda]);
  useEffect(() => {
    for (const msg of messages) {
      agentLastMsgRef.current[msg.agentId] = msg.content;
    }
  }, [messages]);

  // ─── Canvas animation loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = (ts: number) => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(frame); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const vs = viewingSessionRef.current;
      const allAgents = agentsRef.current;
      const visibleAgents = vs
        ? allAgents.filter((a) => vs.agentIds.includes(a.id))
        : allAgents;
      drawMeetingRoomScene(
        ctx, W, H,
        visibleAgents,
        activeAgentIdRef.current,
        ts,
        agentLastMsgRef.current,
        vs ? vs.question : currentAgendaRef.current,
      );
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const q = viewingSession.question;
    setAgenda(q);
    currentAgendaRef.current = q;
    agentLastMsgRef.current = {};
    setViewingSession(null);
    setMessages([]);
    setFinalAnswer("");
    setStatus("");
    setAgentTokens({});
  };

  const handleRun = async () => {
    if (!agenda.trim() || selectedIds.size === 0 || running) return;
    currentAgendaRef.current = agenda.trim();
    agentLastMsgRef.current = {};
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
              agentLastMsgRef.current[payload.agentId] = payload.content;
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
            onClick={() => {
              closeHistory();
              setMessages([]);
              setFinalAnswer("");
              setStatus("");
              setAgentTokens({});
              agentLastMsgRef.current = {};
              currentAgendaRef.current = "";
              setAgenda("");
            }}
            className="w-full py-2 text-xs font-medium border transition-colors font-mono"
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

        {/* ── Canvas: Pixel Art Meeting Room ── */}
        <div className="flex-shrink-0 relative" style={{ height: `${CANVAS_HEIGHT}px` }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ imageRendering: "pixelated" }}
          />
          {/* Agent toggle pills (bottom overlay) */}
          {!viewingSession && agents.length > 0 && (
            <div
              className="absolute bottom-2 left-0 right-0 flex gap-1.5 flex-wrap justify-center px-4"
            >
              {agents.map((a) => {
                const isSelected = selectedIds.has(a.id);
                const tokens = agentTokens[a.id];
                const color = PROVIDER_COLORS[a.provider?.toLowerCase()] ?? "#6B7280";
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAgent(a.id)}
                    disabled={running}
                    title={`${a.name} — ${a.role}`}
                    className="px-2 py-0.5 text-xs font-mono border transition-all"
                    style={{
                      borderColor: isSelected ? color : "rgba(80,90,150,0.35)",
                      background: isSelected ? `${color}22` : "rgba(8,8,20,0.75)",
                      color: isSelected ? color : "#555",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    {a.emoji} {a.name.length > 6 ? a.name.slice(0, 6) : a.name}
                    {tokens ? <span style={{ opacity: 0.7 }}> {(tokens.totalTokens / 1000).toFixed(1)}k</span> : null}
                  </button>
                );
              })}
            </div>
          )}
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
