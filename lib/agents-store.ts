import fs from "fs";
import path from "path";
import crypto from "crypto";

const AGENTS_FILE = path.join(process.env.HOME || "", ".openclaw-team", "agents.json");
const RESEARCH_FILE = path.join(process.env.HOME || "", ".openclaw-team", "research-history.json");

const ENCRYPT_KEY = process.env.AGENT_ENCRYPT_KEY || "openclaw-team-default-key-32byte";
const IV_LENGTH = 16;

export type AgentProvider = "anthropic" | "openai" | "gemini" | "ollama" | "custom";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  provider: AgentProvider;
  apiKeyEncrypted: string;
  baseUrl?: string; // for custom/ollama
  model: string;
  soul: string; // system prompt
  role: string; // e.g. Researcher, Analyst, Synthesizer
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPublic extends Omit<Agent, "apiKeyEncrypted"> {
  hasApiKey: boolean;
}

export interface ResearchSession {
  id: string;
  question: string;
  agentIds: string[];
  dataSource?: string;
  status: "running" | "completed" | "error";
  startedAt: string;
  completedAt?: string;
  messages: ResearchMessage[];
  finalAnswer?: string;
  totalTokens: number;
}

export interface ResearchMessage {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  role: "thinking" | "finding" | "analysis" | "synthesis" | "chat";
  content: string;
  tokensUsed: number;
  timestamp: string;
}

function ensureDir(file: string) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPT_KEY.padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  try {
    const [ivHex, encryptedHex] = text.split(":");
    const key = Buffer.from(ENCRYPT_KEY.padEnd(32, "0").slice(0, 32));
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// --- Agents ---

function readAgents(): Agent[] {
  ensureDir(AGENTS_FILE);
  if (!fs.existsSync(AGENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeAgents(agents: Agent[]) {
  ensureDir(AGENTS_FILE);
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));
}

export function listAgents(): AgentPublic[] {
  return readAgents().map(({ apiKeyEncrypted, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKeyEncrypted,
  }));
}

export function getAgentApiKey(id: string): string {
  const agents = readAgents();
  const agent = agents.find((a) => a.id === id);
  if (!agent) return "";
  return decrypt(agent.apiKeyEncrypted);
}

export function createAgent(data: {
  name: string;
  emoji: string;
  provider: AgentProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  soul: string;
  role: string;
}): AgentPublic {
  const agents = readAgents();
  const now = new Date().toISOString();
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: data.name,
    emoji: data.emoji,
    provider: data.provider,
    apiKeyEncrypted: encrypt(data.apiKey),
    baseUrl: data.baseUrl,
    model: data.model,
    soul: data.soul,
    role: data.role,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  agents.push(agent);
  writeAgents(agents);
  const { apiKeyEncrypted, ...pub } = agent;
  return { ...pub, hasApiKey: true };
}

export function updateAgent(
  id: string,
  data: Partial<{
    name: string;
    emoji: string;
    provider: AgentProvider;
    apiKey: string;
    baseUrl: string;
    model: string;
    soul: string;
    role: string;
    active: boolean;
  }>
): AgentPublic | null {
  const agents = readAgents();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const agent = agents[idx];
  if (data.name !== undefined) agent.name = data.name;
  if (data.emoji !== undefined) agent.emoji = data.emoji;
  if (data.provider !== undefined) agent.provider = data.provider;
  if (data.apiKey !== undefined && data.apiKey !== "") agent.apiKeyEncrypted = encrypt(data.apiKey);
  if (data.baseUrl !== undefined) agent.baseUrl = data.baseUrl;
  if (data.model !== undefined) agent.model = data.model;
  if (data.soul !== undefined) agent.soul = data.soul;
  if (data.role !== undefined) agent.role = data.role;
  if (data.active !== undefined) agent.active = data.active;
  agent.updatedAt = new Date().toISOString();
  agents[idx] = agent;
  writeAgents(agents);
  const { apiKeyEncrypted, ...pub } = agent;
  return { ...pub, hasApiKey: true };
}

export function deleteAgent(id: string): boolean {
  const agents = readAgents();
  const filtered = agents.filter((a) => a.id !== id);
  if (filtered.length === agents.length) return false;
  writeAgents(filtered);
  return true;
}

// --- Research History ---

function readResearch(): ResearchSession[] {
  ensureDir(RESEARCH_FILE);
  if (!fs.existsSync(RESEARCH_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RESEARCH_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function writeResearch(sessions: ResearchSession[]) {
  ensureDir(RESEARCH_FILE);
  // keep last 100 sessions
  const trimmed = sessions.slice(-100);
  fs.writeFileSync(RESEARCH_FILE, JSON.stringify(trimmed, null, 2));
}

export function listResearch(): ResearchSession[] {
  return readResearch().reverse();
}

export function getResearchSession(id: string): ResearchSession | null {
  return readResearch().find((s) => s.id === id) ?? null;
}

export function createResearchSession(data: {
  question: string;
  agentIds: string[];
  dataSource?: string;
}): ResearchSession {
  const sessions = readResearch();
  const session: ResearchSession = {
    id: crypto.randomUUID(),
    question: data.question,
    agentIds: data.agentIds,
    dataSource: data.dataSource,
    status: "running",
    startedAt: new Date().toISOString(),
    messages: [],
    totalTokens: 0,
  };
  sessions.push(session);
  writeResearch(sessions);
  return session;
}

export function appendResearchMessage(sessionId: string, msg: ResearchMessage) {
  const sessions = readResearch();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  sessions[idx].messages.push(msg);
  sessions[idx].totalTokens += msg.tokensUsed;
  writeResearch(sessions);
}

export function completeResearchSession(sessionId: string, finalAnswer: string, status: "completed" | "error" = "completed") {
  const sessions = readResearch();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  sessions[idx].status = status;
  sessions[idx].completedAt = new Date().toISOString();
  sessions[idx].finalAnswer = finalAnswer;
  writeResearch(sessions);
}
