# OpenClaw Team Dashboard

A multi-agent research and monitoring dashboard built on top of [OpenClaw](https://github.com/openclaw/openclaw). Create a team of AI agents with different providers, ask them any question, and watch them research, discuss, and synthesize the best answer together — all visualized in a pixel-art office.

> **Forked and extended from** [xmanrui/OpenClaw-bot-review](https://github.com/xmanrui/OpenClaw-bot-review)

---

## What's New (Custom Features)

### 👥 Team Agents
Manage your own team of AI agents — each with their own provider, model, API key, and **soul** (system prompt/personality).

- Add / Edit / Delete agents
- Providers: Anthropic, OpenAI, Google Gemini, Ollama (local), Custom OpenAI-compatible
- API keys stored encrypted (AES-256-CBC) in `~/.openclaw-team/agents.json`
- Soul templates: Researcher 🔍 / Analyst 📊 / Synthesizer ✍️ / Critic 🎯 / Custom
- Enable / disable agents without deleting

### 🔬 Team Research
Send any question to your agent team and watch them collaborate in real time.

- **Phase 1 — Independent Research:** each agent calls its own LLM API and analyzes the question from its role/soul perspective
- **Phase 2 — Cross Discussion:** agents read each other's findings and add comments / agreements / disagreements
- **Phase 3 — Synthesis:** final answer synthesized from all findings
- Real-time streaming via SSE (Server-Sent Events)
- Token usage tracked per agent (input / output / total)
- Research history saved (last 100 sessions)

### 🏢 Pixel Office Research Bar
Ask your team directly from the Pixel Office — no need to leave the canvas.

- Agent selector pills at the bottom
- Type your question and press Enter
- See live responses and token counts without leaving the office
- Link to full Research page for complete conversation

### 🔌 Data Source Selector (Phase 3 — coming)
- MCP Server connector
- MySQL / PostgreSQL read-only connector for context injection

---

## Original Features (from OpenClaw-bot-review)

- **Bot Overview** — Card wall with name, emoji, model, platform bindings, session stats
- **Model List** — All configured providers and models with per-model test
- **Session Management** — Browse sessions per agent with token usage and connectivity test
- **Statistics** — Token consumption and response time trends (daily / weekly / monthly)
- **Skill Management** — View all installed skills with search and filter
- **Alert Center** — Rule-based alerts via Feishu notification
- **Gateway Health** — Real-time gateway status, 10s polling
- **Pixel Office** — Animated pixel-art office with agent characters, furniture editor, contribution heatmap
- **Dark / Light Theme** — Theme switcher in sidebar
- **i18n** — English / Chinese language switching

---

## Getting Started

```bash
git clone https://github.com/bosocmputer/openclaw-team-dashboard.git
cd openclaw-team-dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Requirements

- Node.js 22+
- No OpenClaw installation required for Team features (calls LLM APIs directly)
- For original monitoring features: OpenClaw installed with `~/.openclaw/openclaw.json`

---

## Data Storage

| File | Contents |
|------|----------|
| `~/.openclaw-team/agents.json` | Agent configs (API keys encrypted) |
| `~/.openclaw-team/research-history.json` | Last 100 research sessions |
| `~/.openclaw/openclaw.json` | OpenClaw config (for original monitoring features) |

---

## Environment Variables

```env
# Custom encryption key for API keys (recommended for production)
AGENT_ENCRYPT_KEY=your-32-character-secret-key-here

# Custom OpenClaw config path (for original monitoring features)
OPENCLAW_HOME=/opt/openclaw
```

---

## Deploy to Server

```bash
# First time
git clone https://github.com/bosocmputer/openclaw-team-dashboard.git
cd openclaw-team-dashboard
npm install
npm run build
cd .next/standalone
PORT=3001 node server.js

# Update (use deploy script)
./scripts/deploy.sh
```

See [PLAN.md](PLAN.md) for full architecture, roadmap, and session continuity reference.

---

## Tech Stack

- **Framework:** Next.js 16 + TypeScript
- **Styling:** Tailwind CSS 4
- **Storage:** JSON files (no database)
- **Streaming:** Server-Sent Events (SSE)
- **Encryption:** AES-256-CBC for API keys
- **LLM Providers:** Anthropic, OpenAI, Google Gemini, Ollama, Custom

---

## Roadmap

- [x] Phase 1 — Agent Management (CRUD, Provider, API Key, Soul)
- [x] Phase 2 — Research Orchestration (3-phase, SSE streaming, token tracking)
- [x] Pixel Office Research Bar
- [ ] Phase 3 — MCP & Database connector
- [ ] Phase 4 — Pixel Office canvas visualization (speech bubbles, data flow lines between agents)
- [ ] Phase 5 — Team Management (group agents by purpose)
