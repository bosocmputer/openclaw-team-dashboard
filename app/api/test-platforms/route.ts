import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

interface PlatformTestResult {
  agentId: string;
  platform: string;
  accountId?: string;
  ok: boolean;
  detail?: string;
  error?: string;
  elapsed: number;
}

// Find the most recent feishu DM user open_id for a given agent
// Each feishu app has its own open_id namespace, so we must use per-agent open_ids
function getFeishuDmUser(agentId: string): string | null {
  try {
    const sessionsPath = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions/sessions.json`);
    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    let bestId: string | null = null;
    let bestTime = 0;
    for (const [key, val] of Object.entries(sessions)) {
      const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
      if (m) {
        const updatedAt = (val as any).updatedAt || 0;
        if (updatedAt > bestTime) {
          bestTime = updatedAt;
          bestId = m[1];
        }
      }
    }
    return bestId;
  } catch {
    return null;
  }
}

// Feishu: get token → verify bot info → send a real DM
async function testFeishu(
  agentId: string,
  accountId: string,
  appId: string,
  appSecret: string,
  domain: string,
  testUserId: string | null
): Promise<PlatformTestResult> {
  const baseUrl = domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
  const startTime = Date.now();

  try {
    // Step 1: get tenant_access_token
    const tokenResp = await fetch(
      `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const tokenData = await tokenResp.json();
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Token failed: ${tokenData.msg || JSON.stringify(tokenData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const token = tokenData.tenant_access_token;

    // Step 2: verify bot info
    const botResp = await fetch(`${baseUrl}/open-apis/bot/v3/info/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    const botData = await botResp.json();
    if (botData.code !== 0 || !botData.bot) {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Bot API error: ${botData.msg || JSON.stringify(botData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const botName = botData.bot.bot_name || accountId;

    // Step 3: send a real DM to test user
    if (!testUserId) {
      return {
        agentId, platform: "feishu", accountId, ok: true,
        detail: `${botName} (bot reachable, no DM session found)`,
        elapsed: Date.now() - startTime,
      };
    }

    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const msgResp = await fetch(
      `${baseUrl}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: testUserId,
          msg_type: "text",
          content: JSON.stringify({ text: `[Platform Test] ${botName} 联通测试 ✅ (${now})` }),
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const msgData = await msgResp.json();
    const elapsed = Date.now() - startTime;

    if (msgData.code === 0) {
      return {
        agentId, platform: "feishu", accountId, ok: true,
        detail: `${botName} → DM sent (${elapsed}ms)`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Send DM failed: ${msgData.msg || JSON.stringify(msgData)}`,
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "feishu", accountId, ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

// Discord: call /users/@me then send a DM to test user
async function testDiscord(
  agentId: string,
  botToken: string,
  testUserId: string | null
): Promise<PlatformTestResult> {
  const startTime = Date.now();

  try {
    const meResp = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(15000),
    });

    const meData = await meResp.json();
    if (!meResp.ok || !meData.id) {
      return {
        agentId, platform: "discord", ok: false,
        error: `Discord API error: ${meData.message || JSON.stringify(meData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const botName = `${meData.username}#${meData.discriminator || "0"}`;

    if (!testUserId) {
      return {
        agentId, platform: "discord", ok: true,
        detail: `${botName} (bot reachable, no test user for DM)`,
        elapsed: Date.now() - startTime,
      };
    }

    // Create DM channel
    const dmChanResp = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: testUserId }),
      signal: AbortSignal.timeout(15000),
    });

    const dmChan = await dmChanResp.json();
    if (!dmChanResp.ok || !dmChan.id) {
      return {
        agentId, platform: "discord", ok: false,
        error: `Create DM channel failed: ${dmChan.message || JSON.stringify(dmChan)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const msgResp = await fetch(
      `https://discord.com/api/v10/channels/${dmChan.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `[Platform Test] ${botName} connectivity test ✅ (${now})`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const msgData = await msgResp.json();
    const elapsed = Date.now() - startTime;

    if (msgResp.ok && msgData.id) {
      return {
        agentId, platform: "discord", ok: true,
        detail: `${botName} → DM sent (${elapsed}ms)`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "discord", ok: false,
        error: `Send DM failed: ${msgData.message || JSON.stringify(msgData)}`,
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "discord", ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

// Find the most recent telegram DM chat_id for a given agent
function getTelegramDmUser(agentId: string): string | null {
  try {
    const sessionsPath = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions/sessions.json`);
    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    let bestId: string | null = null;
    let bestTime = 0;
    for (const [key, val] of Object.entries(sessions)) {
      const m = key.match(/^agent:[^:]+:telegram:direct:(.+)$/);
      if (m) {
        const updatedAt = (val as any).updatedAt || 0;
        if (updatedAt > bestTime) {
          bestTime = updatedAt;
          bestId = m[1];
        }
      }
    }
    return bestId;
  } catch {
    return null;
  }
}

// Telegram: call /getMe to verify bot, then send test DM
async function testTelegram(
  agentId: string,
  botToken: string,
  testChatId: string | null
): Promise<PlatformTestResult> {
  const startTime = Date.now();

  try {
    const meResp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });

    const meData = await meResp.json();

    if (!meResp.ok || !meData.ok || !meData.result) {
      return {
        agentId, platform: "telegram", ok: false,
        error: `Telegram API error: ${meData.description || JSON.stringify(meData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const botName = meData.result.username ? `@${meData.result.username}` : meData.result.first_name;

    if (!testChatId) {
      return {
        agentId, platform: "telegram", ok: true,
        detail: `${botName} (bot reachable, no DM session found)`,
        elapsed: Date.now() - startTime,
      };
    }

    // Send test message
    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const msgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: testChatId,
        text: `[Platform Test] ${botName} 联通测试 ✅ (${now})`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const msgData = await msgResp.json();
    const elapsed = Date.now() - startTime;

    if (msgData.ok) {
      return {
        agentId, platform: "telegram", ok: true,
        detail: `${botName} → DM sent (${elapsed}ms)`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "telegram", ok: false,
        error: `Send DM failed: ${msgData.description || JSON.stringify(msgData)}`,
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "telegram", ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

// Find the most recent whatsapp DM user for a given agent
function getWhatsappDmUser(agentId: string): string | null {
  try {
    const sessionsPath = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions/sessions.json`);
    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    let bestId: string | null = null;
    let bestTime = 0;
    for (const [key, val] of Object.entries(sessions)) {
      const m = key.match(/^agent:[^:]+:whatsapp:direct:(.+)$/);
      if (m) {
        const updatedAt = (val as any).updatedAt || 0;
        if (updatedAt > bestTime) {
          bestTime = updatedAt;
          bestId = m[1];
        }
      }
    }
    return bestId;
  } catch {
    return null;
  }
}

async function testWhatsapp(
  agentId: string,
  gatewayPort: number,
  gatewayToken: string,
  testUserId: string | null
): Promise<PlatformTestResult> {
  const startTime = Date.now();

  if (!testUserId) {
    return {
      agentId, platform: "whatsapp", ok: false,
      error: "No WhatsApp DM session found — send a message to the bot first",
      elapsed: Date.now() - startTime,
    };
  }

  try {
    // WhatsApp has no public Bot API. Use `openclaw message send` CLI
    // to send a real message via the gateway's WhatsApp Web connection.
    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const { execFileSync } = await import("child_process");

    const args = [
      "message", "send",
      "--channel", "whatsapp",
      "-t", testUserId,
      "--message", `[Platform Test] WhatsApp 联通测试 ✅ (${now})`,
    ];

    const result = execFileSync("openclaw", args, {
      timeout: 30000,
      encoding: "utf-8",
      env: { ...process.env },
    });

    const elapsed = Date.now() - startTime;

    // Check for success indicator in output
    const ok = result.includes("Sent via gateway") || result.includes("Message ID");

    if (ok) {
      // Extract message ID if present
      const idMatch = result.match(/Message ID:\s*(\S+)/);
      const msgId = idMatch ? idMatch[1] : "";
      return {
        agentId, platform: "whatsapp", ok: true,
        detail: `WhatsApp → DM sent to ${testUserId} (${elapsed}ms)${msgId ? ' · ' + msgId : ''}`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "whatsapp", ok: false,
        error: result.trim().slice(0, 300) || "No success confirmation from openclaw",
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "whatsapp", ok: false,
      error: (err.stderr || err.message || "Unknown error").slice(0, 300),
      elapsed: Date.now() - startTime,
    };
  }
}

// Agent session test: use Gateway chatCompletions API to send health check
// When sessionKey is provided, message routes to that session (e.g. feishu DM session)
async function testAgentSession(agentId: string, sessionKey: string | undefined, gatewayPort: number, gatewayToken: string): Promise<{ agentId: string; ok: boolean; reply?: string; error?: string; elapsed: number }> {
  const startTime = Date.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${gatewayToken}`,
      "x-openclaw-agent-id": agentId,
    };
    if (sessionKey) {
      headers["x-openclaw-session-key"] = sessionKey;
    }

    const resp = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: "Health check: reply with OK" }],
        max_tokens: 64,
      }),
      signal: AbortSignal.timeout(100000),
    });

    const data = await resp.json();
    const elapsed = Date.now() - startTime;

    if (!resp.ok) {
      return { agentId, ok: false, error: data.error?.message || JSON.stringify(data), elapsed };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    return {
      agentId, ok: true,
      reply: reply.slice(0, 200) || "(no reply)",
      elapsed,
    };
  } catch (err: any) {
    return {
      agentId, ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

export async function POST() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    const bindings = config.bindings || [];
    const channels = config.channels || {};
    const feishuConfig = channels.feishu || {};
    const feishuAccounts = feishuConfig.accounts || {};
    const feishuDomain = feishuConfig.domain || "feishu";
    const discordConfig = channels.discord || {};
    const discordAllowFrom: string[] = discordConfig.dm?.allowFrom || [];
    const discordTestUser = discordAllowFrom[0] || null;
    const telegramConfig = channels.telegram || {};
    const whatsappConfig = channels.whatsapp || {};

    // Read gateway config early (needed for WhatsApp test)
    const gatewayPort = config.gateway?.port || 18789;
    const gatewayToken = config.gateway?.auth?.token || "";

    let agentList = config.agents?.list || [];
    if (agentList.length === 0) {
      try {
        const agentsDir = path.join(OPENCLAW_HOME, "agents");
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        agentList = dirs
          .filter((d: any) => d.isDirectory() && !d.name.startsWith("."))
          .map((d: any) => ({ id: d.name }));
      } catch {}
      if (agentList.length === 0) {
        agentList = [{ id: "main" }];
      }
    }

    // Phase 1: Platform API tests (parallel)
    const platformTests: Promise<PlatformTestResult>[] = [];
    const agentIds: string[] = [];
    const testedFeishuAccounts = new Set<string>();

    for (const agent of agentList) {
      const id = agent.id;
      agentIds.push(id);

      // Feishu
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      const accountId = feishuBinding?.match?.accountId || id;
      const account = feishuAccounts[accountId];

      if (account && account.appId && account.appSecret && !testedFeishuAccounts.has(accountId)) {
        testedFeishuAccounts.add(accountId);
        const testUserId = getFeishuDmUser(id);
        platformTests.push(testFeishu(id, accountId, account.appId, account.appSecret, feishuDomain, testUserId));
      } else if (!feishuBinding && !account) {
        if (id === "main" && feishuConfig.enabled && feishuConfig.appId && feishuConfig.appSecret && !testedFeishuAccounts.has("main")) {
          testedFeishuAccounts.add("main");
          const testUserId = getFeishuDmUser("main");
          platformTests.push(testFeishu(id, "main", feishuConfig.appId, feishuConfig.appSecret, feishuDomain, testUserId));
        }
      }

      // Discord: only test once
      if (id === "main" && discordConfig.enabled && discordConfig.token) {
        platformTests.push(testDiscord(id, discordConfig.token, discordTestUser));
      }

      // Telegram: only test once
      if (id === "main" && telegramConfig.enabled && telegramConfig.botToken) {
        const telegramTestUser = getTelegramDmUser(id);
        platformTests.push(testTelegram(id, telegramConfig.botToken, telegramTestUser));
      }

      // WhatsApp: only test once, via gateway
      if (id === "main" && whatsappConfig && whatsappConfig.enabled !== false) {
        const whatsappTestUser = getWhatsappDmUser(id);
        platformTests.push(testWhatsapp(id, gatewayPort, gatewayToken, whatsappTestUser));
      }
    }

    const platformResults = await Promise.all(platformTests);

    // Phase 2: Agent session tests via chatCompletions API (sequential)
    // Routes messages to platform DM sessions (feishu, whatsapp, etc.)
    const agentResults: PlatformTestResult[] = [];
    for (const id of agentIds) {
      // Feishu DM session test
      const feishuDmUser = getFeishuDmUser(id);
      const feishuSessionKey = feishuDmUser ? `agent:${id}:feishu:direct:${feishuDmUser}` : `agent:${id}:main`;
      const r = await testAgentSession(id, feishuSessionKey, gatewayPort, gatewayToken);
      agentResults.push({
        agentId: r.agentId,
        platform: "agent",
        ok: r.ok,
        detail: r.reply,
        error: r.error,
        elapsed: r.elapsed,
      });

      // WhatsApp DM session test
      const whatsappDmUser = getWhatsappDmUser(id);
      if (whatsappDmUser) {
        const waSessionKey = `agent:${id}:whatsapp:direct:${whatsappDmUser}`;
        const wr = await testAgentSession(id, waSessionKey, gatewayPort, gatewayToken);
        agentResults.push({
          agentId: wr.agentId,
          platform: "agent-whatsapp",
          ok: wr.ok,
          detail: wr.reply,
          error: wr.error,
          elapsed: wr.elapsed,
        });
      }
    }

    // Flatten all results: platform tests + agent tests
    const results = [...platformResults, ...agentResults];

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
