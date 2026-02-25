import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// 配置文件路径：优先使用 OPENCLAW_HOME 环境变量，否则默认 ~/.openclaw
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");
const OPENCLAW_DIR = OPENCLAW_HOME;

// 30秒内存缓存
let configCache: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

// 从配置的 allowFrom 读取用户 id，用于构建 session key

// 读取 agent 的 session 状态（最近活跃时间、token 用量）- 从 jsonl 文件解析
interface SessionStatus {
  lastActive: number | null;
  totalTokens: number;
  contextTokens: number;
  sessionCount: number;
  todayAvgResponseMs: number;
  messageCount: number;
  weeklyResponseMs: number[]; // 过去7天每天的平均响应时间
  weeklyTokens: number[]; // 过去7天每天的token用量
}

function getAgentSessionStatus(agentId: string): SessionStatus {
  const result: SessionStatus = { lastActive: null, totalTokens: 0, contextTokens: 0, sessionCount: 0, todayAvgResponseMs: 0, messageCount: 0, weeklyResponseMs: [], weeklyTokens: [] };
  const sessionsDir = path.join(OPENCLAW_DIR, `agents/${agentId}/sessions`);
  
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  // 生成过去7天的日期
  const weekDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const dailyResponseTimes: Record<string, number[]> = {};
  const dailyTokens: Record<string, number> = {};
  for (const d of weekDates) { dailyResponseTimes[d] = []; dailyTokens[d] = 0; }
  
  let files: string[];
  try {
    const allFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl") && !f.includes(".deleted."));
    // 只读最近7天修改过的文件
    const cutoff = Date.now() - 7 * 86400000;
    files = allFiles.filter(f => {
      try { return fs.statSync(path.join(sessionsDir, f)).mtimeMs >= cutoff; } catch { return false; }
    });
  } catch { return result; }

  // 使用 Set 来统计唯一的 session
  const sessionKeys = new Set<string>();

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }

    const lines = content.trim().split("\n");
    const messages: { role: string; ts: string; stopReason?: string }[] = [];
    
    for (const line of lines) {
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }
      
      // 统计 session 数量（从 session key 或 message 中的 sessionKey）
      if (entry.sessionKey) {
        sessionKeys.add(entry.sessionKey);
      }
      
      // 解析 token 用量 - 从 assistant 消息的 usage 中获取
      if (entry.type === "message" && entry.message) {
        const msg = entry.message;
        if (msg.role === "assistant" && msg.usage) {
          result.totalTokens += msg.usage.input || 0;
          result.totalTokens += msg.usage.output || 0;
          result.messageCount += 1;
          // 按天统计 token
          if (entry.timestamp) {
            const msgDate = entry.timestamp.slice(0, 10);
            if (dailyTokens[msgDate] !== undefined) {
              dailyTokens[msgDate] += (msg.usage.input || 0) + (msg.usage.output || 0);
            }
          }
        }
        // 更新最近活跃时间
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (!result.lastActive || ts > result.lastActive) {
            result.lastActive = ts;
          }
          messages.push({ role: msg.role, ts: entry.timestamp, stopReason: msg.stopReason });
        }
      }
    }
    
    // O(n) 响应时间计算：跟踪最近的 user 消息，匹配下一个 assistant stop
    let lastUserTs: string | null = null;
    for (const msg of messages) {
      if (msg.role === "user") {
        lastUserTs = msg.ts;
      } else if (msg.role === "assistant" && msg.stopReason === "stop" && lastUserTs) {
        const msgDate = lastUserTs.slice(0, 10);
        if (dailyResponseTimes[msgDate]) {
          const diffMs = new Date(msg.ts).getTime() - new Date(lastUserTs).getTime();
          if (diffMs > 0 && diffMs < 600000) {
            dailyResponseTimes[msgDate].push(diffMs);
          }
        }
        lastUserTs = null;
      }
    }
  }
  
  result.sessionCount = sessionKeys.size || files.length; // 降级为文件数
  const todayTimes = dailyResponseTimes[today] || [];
  if (todayTimes.length > 0) {
    result.todayAvgResponseMs = Math.round(todayTimes.reduce((a, b) => a + b, 0) / todayTimes.length);
  }
  result.weeklyResponseMs = weekDates.map(d => {
    const times = dailyResponseTimes[d];
    if (!times || times.length === 0) return 0;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  });
  result.weeklyTokens = weekDates.map(d => dailyTokens[d] || 0);
  return result;
}

// 读取所有 agent 的群聊信息
interface GroupChat {
  groupId: string;
  agents: { id: string; emoji: string; name: string }[];
  channel: string;
}

function getGroupChats(agentIds: string[], agentMap: Record<string, { emoji: string; name: string }>, feishuAgentIds: string[], sessionsMap: Map<string, any>): GroupChat[] {
  const groupAgents: Record<string, { agents: Set<string>; channel: string }> = {};
  for (const agentId of agentIds) {
    try {
      const sessions = sessionsMap.get(agentId);
      if (!sessions) continue;
      for (const key of Object.keys(sessions)) {
        // 匹配群聊 session: agent:{id}:feishu:group:{groupId} 或 agent:{id}:discord:channel:{channelId}
        const feishuGroup = key.match(/^agent:[^:]+:feishu:group:(.+)$/);
        const discordGroup = key.match(/^agent:[^:]+:discord:channel:(.+)$/);
        if (feishuGroup) {
          const gid = `feishu:${feishuGroup[1]}`;
          if (!groupAgents[gid]) groupAgents[gid] = { agents: new Set(), channel: "feishu" };
          groupAgents[gid].agents.add(agentId);
        }
        if (discordGroup) {
          const gid = `discord:${discordGroup[1]}`;
          if (!groupAgents[gid]) groupAgents[gid] = { agents: new Set(), channel: "discord" };
          groupAgents[gid].agents.add(agentId);
        }
      }
    } catch {}
  }
  // 返回每个群聊实际有 session 的 agents
  return Object.entries(groupAgents)
    .filter(([, v]) => v.agents.size > 0)
    .map(([groupId, v]) => ({
      groupId,
      channel: v.channel,
      agents: Array.from(v.agents).map(id => ({ id, emoji: agentMap[id]?.emoji || "🤖", name: agentMap[id]?.name || id })),
    }));
}

// 从 OpenClaw sessions 文件获取每个 agent 最近活跃的飞书 DM session 的用户 open_id
function getFeishuUserOpenIds(agentIds: string[], sessionsMap: Map<string, any>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const agentId of agentIds) {
    try {
      const sessions = sessionsMap.get(agentId);
      if (!sessions) continue;
      let best: { openId: string; updatedAt: number } | null = null;
      for (const [key, val] of Object.entries(sessions)) {
        const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
        if (m) {
          const updatedAt = (val as any).updatedAt || 0;
          if (!best || updatedAt > best.updatedAt) {
            best = { openId: m[1], updatedAt };
          }
        }
      }
      if (best) map[agentId] = best.openId;
    } catch {}
  }
  return map;
}
// 从 IDENTITY.md 读取机器人名字
function readIdentityName(agentId: string, agentDir?: string, workspace?: string): string | null {
  const candidates = [
    agentDir ? path.join(agentDir, "IDENTITY.md") : null,
    workspace ? path.join(workspace, "IDENTITY.md") : null,
    path.join(OPENCLAW_DIR, `agents/${agentId}/agent/IDENTITY.md`),
    path.join(OPENCLAW_DIR, `workspace-${agentId}/IDENTITY.md`),
    // 只有 main agent 才 fallback 到默认 workspace
    agentId === "main" ? path.join(OPENCLAW_DIR, `workspace/IDENTITY.md`) : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, "utf-8");
      const match = content.match(/\*\*Name:\*\*\s*(.+)/);
      if (match) {
        const name = match[1].trim();
        if (name && !name.startsWith("_") && !name.startsWith("(")) return name;
      }
    } catch {}
  }
  return null;
}

export async function GET() {
  // 命中缓存直接返回
  if (configCache && Date.now() - configCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(configCache.data);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    // 提取 agents 信息
    const defaults = config.agents?.defaults || {};
    const defaultModel = typeof defaults.model === "string"
      ? defaults.model
      : defaults.model?.primary || "unknown";
    const fallbacks = typeof defaults.model === "object"
      ? defaults.model?.fallbacks || []
      : [];

    let agentList = config.agents?.list || [];
    const bindings = config.bindings || [];
    const channels = config.channels || {};
    const feishuAccounts = channels.feishu?.accounts || {};

    // Auto-discover agents from ~/.openclaw/agents/ when agents.list is empty
    if (agentList.length === 0) {
      try {
        const agentsDir = path.join(OPENCLAW_DIR, "agents");
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        agentList = dirs
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .map((d) => ({ id: d.name }));
      } catch {}
      // If still empty, at least include "main"
      if (agentList.length === 0) {
        agentList = [{ id: "main" }];
      }
    }

    // 一次性读取所有 agent 的 sessions.json，避免重复读取
    const agentIds = agentList.map((a: any) => a.id);
    const sessionsMap = new Map<string, any>();
    for (const agentId of agentIds) {
      try {
        const sessionsPath = path.join(OPENCLAW_DIR, `agents/${agentId}/sessions/sessions.json`);
        const raw = fs.readFileSync(sessionsPath, "utf-8");
        sessionsMap.set(agentId, JSON.parse(raw));
      } catch {}
    }

    // 从预读的 sessions 数据获取飞书用户 open_id
    const feishuUserOpenIds = getFeishuUserOpenIds(agentIds, sessionsMap);
    const discordDmAllowFrom = channels.discord?.dm?.allowFrom || [];

    // Build a set of agent IDs that have explicit feishu bindings
    const boundFeishuAgentIds = new Set(
      bindings
        .filter((b: any) => b.match?.channel === "feishu")
        .map((b: any) => b.agentId)
    );

    // 构建 agent 详情
    const agents = await Promise.all(agentList.map(async (agent: any) => {
      const id = agent.id;
      const identityName = readIdentityName(id, agent.agentDir, agent.workspace);
      const name = identityName || agent.name || id;
      const emoji = agent.identity?.emoji || "🤖";
      const model = agent.model || defaultModel;

      // 查找绑定的平台
      const platforms: { name: string; accountId?: string; appId?: string; botOpenId?: string; botUserId?: string }[] = [];

      // 检查飞书绑定 (explicit binding)
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      if (feishuBinding) {
        const accountId = feishuBinding.match?.accountId || id;
        const acc = feishuAccounts[accountId];
        const appId = acc?.appId;
        const userOpenId = feishuUserOpenIds[id] || null;
        platforms.push({ name: "feishu", accountId, appId, ...(userOpenId && { botOpenId: userOpenId }) });
      }

      // If no explicit binding, check if there's a feishu account matching this agent id
      if (!feishuBinding && feishuAccounts[id]) {
        const acc = feishuAccounts[id];
        const appId = acc?.appId;
        const userOpenId = feishuUserOpenIds[id] || null;
        platforms.push({ name: "feishu", accountId: id, appId, ...(userOpenId && { botOpenId: userOpenId }) });
      }

      // main agent 特殊处理：默认绑定所有未显式绑定的 channel
      if (id === "main") {
        const hasFeishu = platforms.some((p) => p.name === "feishu");
        if (!hasFeishu && channels.feishu?.enabled) {
          // main gets feishu if channel is enabled and no other detection matched
          const acc = feishuAccounts["main"];
          const appId = acc?.appId || channels.feishu?.appId;
          const userOpenId = feishuUserOpenIds["main"] || null;
          platforms.push({ name: "feishu", accountId: "main", appId, ...(userOpenId && { botOpenId: userOpenId }) });
        }
        if (channels.discord?.enabled) {
          const botUserId = discordDmAllowFrom[0] || null;
          platforms.push({ name: "discord", ...(botUserId && { botUserId }) });
        }
      }

      // Also detect discord for non-main agents if they have discord bindings
      if (id !== "main") {
        const discordBinding = bindings.find(
          (b: any) => b.agentId === id && b.match?.channel === "discord"
        );
        if (discordBinding) {
          platforms.push({ name: "discord" });
        }
      }

      return { id, name, emoji, model, platforms };
    }));

    // 为每个 agent 添加 session 状态
    const agentsWithStatus = agents.map((agent: any) => ({
      ...agent,
      session: getAgentSessionStatus(agent.id),
    }));

    // 构建 agent 映射（用于群聊）
    const agentMap: Record<string, { emoji: string; name: string }> = {};
    for (const a of agentsWithStatus) agentMap[a.id] = { emoji: a.emoji, name: a.name };

    // 获取群聊信息（传入所有绑定了飞书的 agent id）
    const feishuAgentIds = agentsWithStatus.filter((a: any) => a.platforms.some((p: any) => p.name === "feishu")).map((a: any) => a.id);
    const groupChats = getGroupChats(agentIds, agentMap, feishuAgentIds, sessionsMap);

    // 提取模型 providers
    const providers = Object.entries(config.models?.providers || {}).map(
      ([providerId, provider]: [string, any]) => {
        const models = (provider.models || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          reasoning: m.reasoning,
          input: m.input,
        }));

        // 找出使用该 provider 的 agents
        const usedBy = agentsWithStatus
          .filter((a: any) => a.model.startsWith(providerId + "/"))
          .map((a: any) => ({ id: a.id, emoji: a.emoji, name: a.name }));

        return {
          id: providerId,
          api: provider.api,
          models,
          usedBy,
        };
      }
    );

    const data = {
      agents: agentsWithStatus,
      providers,
      defaults: { model: defaultModel, fallbacks },
      gateway: { port: config.gateway?.port || 18789, token: config.gateway?.auth?.token || "" },
      groupChats,
    };
    configCache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
