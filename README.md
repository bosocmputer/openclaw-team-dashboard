# OpenClaw Team Dashboard

AI Meeting Room — สร้างทีม AI agents หลายตัว ถามคำถามเดียว แล้วดู agents ถกเถียง วิเคราะห์ และสรุปมติร่วมกัน แบบ real-time ทั้งในรูปแบบ text และ pixel-art meeting room

> **Forked and extended from** [xmanrui/OpenClaw-bot-review](https://github.com/xmanrui/OpenClaw-bot-review)

---

## Features

### 👥 Team Agents (`/agents`)
สร้างและจัดการทีม AI agents — แต่ละตัวมี provider, model, API key, soul (บุคลิก), skills, MCP endpoint เป็นของตัวเอง

- **19 Agent Templates** สำเร็จรูป: CEO, CFO, CMO, Legal, HR, Sales, Ops, Software Architect, Security Engineer ฯลฯ
- **6 Providers:** Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Custom
- **16 Skills** per agent: web_search, code_execution, data_analysis, financial_modeling ฯลฯ
- **Soul (System Prompt)** — กำหนดบุคลิก จุดยืน และวิธีถกเถียงของ agent
- **MCP Endpoint** — เชื่อม MCP Server per agent เพื่อดึงข้อมูลจากระบบภายนอก
- **Seniority (1–99)** — ลำดับพูดในการประชุม
- API keys encrypted (AES-256-CBC)

### 🏛️ Meeting Room (`/research`)
ห้องประชุม AI — ประธานนำทีมถกเถียงและสรุปมติทุกวาระ

- **3-Phase Meeting Flow:**
  1. **นำเสนอ** — agents พูดตามลำดับ seniority จาก soul/role
  2. **อภิปราย** — agents อ่านความเห็นกัน แสดงจุดยืน เห็นด้วย/ไม่เห็นด้วย
  3. **มติประธาน** — Chairman สรุป + Action Items
- **Chairman Auto-Detection** จาก role/seniority
- **Real-time SSE Streaming** — ดูทุก agent ตอบ real-time
- **Data Sources:**
  - 📎 File Attachment (xlsx/pdf/docx/csv/json/txt, max 10MB)
  - 🔌 MCP per Agent (ดึงข้อมูลจาก MCP Server อัตโนมัติ)
  - 🌐 Web Search (Serper/SerpApi) per agent
- **Token Tracking** per agent (input/output/total)
- **Charts**: Auto-render Bar/Line/Pie จาก AI output
- **History**: ดูประวัติ sessions เก่า + follow-up suggestions
- **Export**: Meeting Minutes เป็น Markdown

### 🏛️ Pixel Meeting Room (`/pixel-office-research`)
ฟีเจอร์เดียวกับ `/research` แต่แสดงบน pixel-art canvas — agents นั่งรอบโต๊ะประชุม พร้อม animation

### 📋 Teams (`/teams`)
จัดกลุ่ม agents เป็น teams เพื่อเลือกใช้ใน Research

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
- No database required — ทุกอย่างเก็บเป็น JSON files

---

## Data Storage

| File | Contents |
|------|----------|
| `~/.openclaw-team/agents.json` | Agent configs (API keys encrypted) |
| `~/.openclaw-team/teams.json` | Team groupings |
| `~/.openclaw-team/settings.json` | Web Search API keys (encrypted) |
| `~/.openclaw-team/research-history.json` | Research session history |

---

## Environment Variables

```env
# Custom encryption key for API keys (recommended for production)
AGENT_ENCRYPT_KEY=your-32-character-secret-key-here
```

---

## Deploy to Server

```bash
# First time
git clone https://github.com/bosocmputer/openclaw-team-dashboard.git
cd openclaw-team-dashboard
npm install
npm run build
cp -r .next/static .next/standalone/.next/static
PORT=3001 node .next/standalone/server.js

# Update
./scripts/deploy.sh
```

> ⚠️ ต้อง `cp -r .next/static .next/standalone/.next/static` ทุกครั้ง ไม่งั้นจะเกิด ChunkLoadError

See [PLAN.md](PLAN.md) for full architecture and roadmap.

---

## Tech Stack

- **Framework:** Next.js 16 + TypeScript
- **Styling:** Tailwind CSS 4
- **Storage:** JSON files (no database)
- **Streaming:** Server-Sent Events (SSE)
- **Encryption:** AES-256-CBC for API keys
- **LLM Providers:** Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Custom
- **MCP:** Direct REST protocol per agent

---

## Roadmap

- [x] Phase 1 — Agent Management (CRUD, 19 templates, 16 skills, soul, seniority)
- [x] Phase 2 — Research Meeting Room (3-phase flow, SSE, charts, history)
- [x] Phase 3 — File Attachment (xlsx/pdf/docx/csv/json/txt + Excel Sheet Selector)
- [x] Phase 4 — MCP Per-Agent (endpoint, access mode, tool selection scoring)
- [x] Pixel Office Meeting Room (canvas + full meeting features)
- [x] Team Management CRUD
- [ ] Phase 5 — ตัดหน้าที่ไม่ใช้ออก (original OpenClaw pages)
- [ ] Phase 6 — Team ↔ Research integration (team selector, filter)
- [ ] Phase 7 — Pixel Office visualization enhancement (speech bubbles, crown)
