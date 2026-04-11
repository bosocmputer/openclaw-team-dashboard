# OpenClaw Team Dashboard — Project Plan

> อ้างอิงเอกสารนี้เมื่อ token หมดหรือเริ่ม session ใหม่  
> อัปเดตล่าสุด: 2026-04-11

---

## สถานะโปรเจค (ณ วันที่ 11 เมษายน 2026)

**Server:** `http://192.168.2.109:3001` — ✅ Online (next-server v16, PID 1056571)  
**Agents ที่ใช้งาน:** 9 ตัว (ทุกตัว active, ใช้ OpenRouter เป็น provider)  
**Research Sessions:** 27 sessions สะสม  
**Teams:** 0 (สร้างโครงสร้างเสร็จแล้ว ยังไม่ได้ใช้งาน)  
**Web Search Keys:** ✅ Serper + SerpApi ตั้งค่าแล้ว  
**MCP Endpoint:** 4 agents เชื่อมต่อ `http://192.168.2.213:3248/sse`

### หน้าหลักที่ใช้งาน (4 หน้า)
| หน้า | Path | สถานะ |
|------|------|--------|
| 👥 Team Agents | `/agents` | ✅ สมบูรณ์ — CRUD + 19 templates + MCP config |
| 📋 Teams | `/teams` | ✅ CRUD สมบูรณ์ — ยังไม่มี team จริง |
| 🔬 Research | `/research` | ✅ สมบูรณ์ — Meeting Flow 3 phases + MCP + File |
| 🏛️ Meeting Room | `/pixel-office-research` | ✅ สมบูรณ์ — Pixel art + research features |

### หน้าที่จะตัดออก (จาก OpenClaw เดิม)
| หน้า | Path | เหตุผล |
|------|------|--------|
| Bot Overview | `/` | หน้า original OpenClaw — ไม่เกี่ยวกับ Team |
| Pixel Office | `/pixel-office` | ใช้ `/pixel-office-research` แทน |
| Models | `/models` | จัดการ model ผ่าน `/agents` แทน |
| Sessions | `/sessions` | ไม่ได้ใช้ — research history อยู่ใน `/research` |
| Stats | `/stats` | ไม่ได้ใช้ |
| Alerts | `/alerts` | ไม่ได้ใช้ |
| Skills | `/skills` | skill เลือกในหน้า `/agents` แล้ว |
| Settings | `/settings` | Web Search keys ตั้งแล้ว — อาจรวมเข้า sidebar config |

---

## ฟีเจอร์ที่สร้างเสร็จแล้ว

### 1. Agent Management (`/agents`) — ✅ สมบูรณ์
- **API:** `GET/POST /api/team-agents`, `PATCH/DELETE /api/team-agents/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/agents.json` (ไม่มี DB)
- **ฟีเจอร์:**
  - เลือก Provider: Anthropic / OpenAI / Gemini / Ollama / OpenRouter / Custom
  - ใส่ API Key (encrypt ด้วย AES-256-CBC)
  - เลือก Model (โหลดจาก `/api/team-models?provider=xxx`)
  - ตั้ง Base URL สำหรับ Ollama/Custom
  - ตั้ง Soul (System Prompt) — บุคลิกและบทบาทของ agent
  - **19 Agent Templates** แบ่ง 4 หมวด: Business(7) / IT(8) / Research(4) / General(2)
  - **16 Skills** per agent
  - **useWebSearch toggle** — เปิด/ปิด Web Search per agent
  - **Seniority slider (1–99)** — ลำดับพูดในประชุม
  - **MCP Endpoint + Access Mode** — เชื่อม MCP Server per agent
  - เปิด/ปิด agent โดยไม่ลบ
- **Agents ปัจจุบันบน server (9 ตัว):**
  | Emoji | ชื่อ | Provider / Model | MCP |
  |-------|------|-----------------|-----|
  | 👔 | CEO Advisor | openrouter / claude-sonnet-4-5 | ✅ |
  | 💰 | CFO Analyst | openrouter / gemini-2.0-flash | ✅ |
  | 📣 | CMO Strategist | openrouter / gemini-2.0-flash | ✅ |
  | 👥 | HR Lead | openrouter / gemini-2.0-flash | ✅ |
  | ⚖️ | Legal Advisor | openrouter / claude-sonnet-4-5 | ❌ (web search ✅) |
  | 🤝 | Sales Coach | openrouter / gemini-2.0-flash | ❌ |
  | ⚙️ | Ops Manager | openrouter / gemini-2.0-flash | ❌ |
  | 💰 | คุณไอ้ติม (หัวหน้าบัญชี) | openrouter / claude-sonnet-4-5 | ❌ |
  | 🤖 | คุณอัย (พนักงานบัญชี) | openrouter / gemini-2.0-flash | ❌ |

### 2. Team Management (`/teams`) — ✅ CRUD สมบูรณ์
- **API:** `GET/POST /api/teams`, `PATCH/DELETE /api/teams/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/teams.json`
- **ฟีเจอร์:**
  - สร้าง/แก้ไข/ลบ teams
  - เลือก agents เข้า team (multi-select)
  - ลิงก์ "🔬 Research กับ Team นี้" → ไปหน้า `/research?teamId=xxx`
- **สถานะจริง:** ยังไม่มี team ที่สร้างไว้ (`teams.json = []`)

### 3. Meeting Room / Research (`/research`) — ✅ สมบูรณ์
- **API:** `POST /api/team-research/stream` (Server-Sent Events)
- **API ประวัติ:** `GET /api/team-research`, `GET /api/team-research/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/research-history.json` (27 sessions สะสม)
- **localStorage:** `research_conversation_v1` — จำ conversation ข้าม refresh
- **Meeting Flow:**
  1. **Chairman Detection** — ตรวจ role/seniority อัตโนมัติ
  2. **Chairman Opening** — ประธานเปิดประชุม
  3. **Phase 1 — นำเสนอ:** agents พูดตามลำดับ seniority
  4. **Phase 2 — อภิปราย:** agents อ่านความเห็นแล้วแสดงจุดยืนตาม soul
  5. **Phase 3 — มติประธาน:** Chairman สรุป + Action Items
- **Data Sources:**
  - 📎 **File Attachment** — xlsx/pdf/docx/csv/json/txt (max 10MB, 40K chars) + Excel Sheet Selector
  - 🔌 **MCP per Agent** — agent ที่มี mcpEndpoint จะ fetch `/tools` → เรียก `/call` → inject context
  - Toggle switch เปิด/ปิด แยกกัน (default: เปิดทั้งคู่)
- **Web Search:** agent ที่เปิด useWebSearch จะค้นหาก่อนตอบ
- **Token Optimization — historyMode:** full / last3 / summary / none
- **Chart Auto-render:** Bar/Line/Pie (ไม่ใช้ external lib)
- **Meeting Minutes Export:** Markdown รายงานการประชุม
- **Follow-up Suggestions:** 3 วาระต่อเนื่อง
- **Server History Sidebar:** ดูประวัติ sessions เก่า
- **Auto-scroll:** หยุดเมื่อ user scroll ขึ้น + ปุ่ม "⬇ ไปล่างสุด"

### 4. Pixel Office Meeting Room (`/pixel-office-research`) — ✅ สมบูรณ์
- **ฟีเจอร์เดียวกับ `/research`** แต่แสดงบน canvas pixel art:
  - Meeting room layout 15×13 tiles พร้อมโต๊ะประชุม เก้าอี้ whiteboard
  - Agent sprites นั่งรอบโต๊ะ + animation
  - Chairman badge บน agent pill
  - Phase labels ภาษาไทย
  - Speech bubbles / floating code บน canvas
  - Server history panel overlay
  - localStorage: `pixel_research_conversation_v1`

### 5. Settings (`/settings`) — ✅ ตั้งค่าแล้ว
- **Web Search Keys:** Serper + SerpApi (encrypted, บันทึกแล้วบน server)

### 6. Web Search Integration — ✅ ทำงานได้
- **API:** `POST /api/team-websearch`
- **Flow:** Serper → SerpApi fallback → inject context

### 7. MCP Integration — ✅ สมบูรณ์ (Phase 4, 2026-04-10)
- Per-agent MCP config: `mcpEndpoint` + `mcpAccessMode`
- Test button: `GET /health` → `GET /tools`
- Tool Selection Scoring: boost analytics tools, penalize search tools
- `buildToolArguments()` per tool name
- Direct REST `/call` protocol

---

## Architecture

```
openclaw-team-dashboard/
├── app/
│   ├── agents/page.tsx              ← Agent CRUD + 19 templates + MCP config (929 lines)
│   ├── teams/page.tsx               ← Team CRUD + link to research (397 lines)
│   ├── research/page.tsx            ← Meeting Room UI — SSE, charts, file, MCP (1107 lines)
│   ├── pixel-office-research/page.tsx ← Pixel Meeting Room (864 lines)
│   ├── settings/page.tsx            ← Web Search API key settings
│   ├── sidebar.tsx                  ← Navigation (Team / Overview / Monitor / Config groups)
│   ├── api/
│   │   ├── team-agents/
│   │   │   ├── route.ts             (GET list, POST create)
│   │   │   └── [id]/route.ts        (PATCH update, DELETE)
│   │   ├── team-models/route.ts     (models per provider)
│   │   ├── team-settings/route.ts   (GET/POST Web Search keys)
│   │   ├── team-websearch/route.ts  (POST — Serper→SerpApi fallback)
│   │   ├── team-research/
│   │   │   ├── route.ts             (GET history)
│   │   │   ├── [id]/route.ts        (GET single session)
│   │   │   ├── stream/route.ts      (POST SSE — 3 phases + MCP + web search, 788 lines)
│   │   │   └── upload/route.ts      (POST multipart — parse files)
│   │   └── teams/
│   │       ├── route.ts             (GET/POST)
│   │       └── [id]/route.ts        (PATCH/DELETE)
│   └── ... (หน้าเดิม OpenClaw — จะตัดออก)
├── lib/
│   ├── agents-store.ts              ← File-based storage + AES-256 encryption
│   └── pixel-office/               ← Pixel office engine, sprites, layout
└── PLAN.md
```

### Data Files (บน server `~/.openclaw-team/`)
| File | ขนาด | เนื้อหา |
|------|------|---------|
| `agents.json` | 9 agents | configs + encrypted API keys + MCP endpoints |
| `teams.json` | ว่าง `[]` | team definitions |
| `settings.json` | 1 entry | Serper + SerpApi keys (encrypted) |
| `research-history.json` | 27 sessions | ประวัติการประชุม |

### SSE Events (stream/route.ts)
| Event | Data |
|-------|------|
| `session` | `{sessionId}` |
| `chairman` | `{agentId, name, emoji, role}` |
| `status` | `{message}` |
| `agent_start` | `{agentId, isChairman}` |
| `agent_searching` | `{agentId, query}` |
| `message` | `ResearchMessage` |
| `agent_tokens` | `{agentId, inputTokens, outputTokens, totalTokens}` |
| `final_answer` | `{content}` |
| `chart_data` | `{type, title, labels, datasets}` |
| `follow_up_suggestions` | `{suggestions: string[]}` |
| `done` | `{sessionId}` |

### Providers ที่รองรับ
| Provider | API Format |
|----------|-----------|
| Anthropic | Anthropic SDK |
| OpenAI | OpenAI SDK |
| Gemini | Google GenAI SDK |
| Ollama | OpenAI-compatible |
| OpenRouter | OpenAI-compatible + Bearer |
| Custom | OpenAI-compatible |

---

## Server & Deployment

- **Server:** `bosscatdog@192.168.2.109` (password: boss123456)
- **Port:** 3001
- **Repo:** https://github.com/bosocmputer/openclaw-team-dashboard

### Deploy Command
```bash
sshpass -p boss123456 ssh -o StrictHostKeyChecking=no bosscatdog@192.168.2.109 "
  kill \$(ss -tlnp 2>/dev/null | grep 3001 | grep -oP 'pid=\K[0-9]+') 2>/dev/null || true
  cd ~/openclaw-team-dashboard && git pull origin main && rm -rf .next && npm run build
  cp -r .next/static .next/standalone/.next/static
  nohup env PORT=3001 node .next/standalone/server.js >> /tmp/team-dashboard.log 2>&1 & disown
"
```

> ⚠️ **สำคัญ:** ต้อง `cp -r .next/static .next/standalone/.next/static` ทุกครั้ง

---

## แผนงานถัดไป

### Phase 5 — ตัดหน้าที่ไม่ใช้ออก (TODO)
- ลบหน้า original OpenClaw: `/`, `/pixel-office`, `/models`, `/sessions`, `/stats`, `/alerts`, `/skills`
- ปรับ sidebar ให้เหลือแค่ 4 หน้าหลัก + Settings
- ย้าย Settings เข้า sidebar config หรือ modal ใน `/agents`
- ตั้ง `/agents` หรือ `/research` เป็น landing page

### Phase 6 — ปรับปรุง Team ↔ Research Flow
- เพิ่ม team selector ใน `/research` (เลือกประชุมเฉพาะ agents ใน team)
- Research filter ด้วย `?teamId=` ให้ทำงานจริง
- Default team สำหรับ quick research

### Phase 7 — Pixel Office Visualization Enhancement
- Speech bubbles แบบ real-time บน canvas ระหว่างประชุม
- Chairman มี crown/highlight พิเศษบน canvas
- Thinking animation (ฟองอากาศ ...) ตอน web search

---

## Environment Variables (Optional)

```env
AGENT_ENCRYPT_KEY=your-32-character-secret-key-here
HOME=/custom/path
```

---

## หมายเหตุสำคัญ

1. **API Keys** เก็บแบบ encrypted (AES-256-CBC)
2. **ไม่มี database** — ทุกอย่างเป็น JSON files
3. **ChunkLoadError** — ต้อง copy `.next/static` → `.next/standalone/.next/static` ทุก deploy
4. **Chairman** ถูก detect อัตโนมัติจาก role keyword + seniority field (1 = ประธาน)
5. **historyMode = last3** แนะนำ — balance ระหว่าง context และ token cost
6. **Chart** ถูก AI embed เป็น ` ```chart ` JSON block ใน synthesis แล้ว parse render inline
7. **Web Search Keys** บันทึกแล้วบน server: Serper + SerpApi
8. **MCP Endpoint** — 4 agents เชื่อมต่อ `http://192.168.2.213:3248/sse` (CEO, CFO, CMO, HR)
