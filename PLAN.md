# OpenClaw Team Dashboard — Project Plan

> อ้างอิงเอกสารนี้เมื่อ token หมดหรือเริ่ม session ใหม่

---

## สิ่งที่สร้างแล้ว (สมบูรณ์ทั้งหมด)

### 1. Agent Management System
- **หน้า:** `/agents` — สร้าง/แก้ไข/ลบ/เปิด-ปิด agents
- **API:** `GET/POST /api/team-agents`, `PATCH/DELETE /api/team-agents/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/agents.json` (ไม่มี DB)
- **ฟีเจอร์:**
  - เลือก Provider: Anthropic / OpenAI / Gemini / Ollama / OpenRouter / Custom
  - ใส่ API Key (encrypt ด้วย AES-256-CBC)
  - เลือก Model (โหลดจาก `/api/team-models?provider=xxx`)
  - ตั้ง Base URL สำหรับ Ollama/Custom
  - ตั้ง Soul (System Prompt) — บุคลิกและบทบาทของ agent
  - Soul Templates (6 แบบ + Custom): Researcher, Analyst, Synthesizer, Critic, Optimist, Pessimist
  - **19 Agent Templates สำเร็จรูป** แบ่งเป็น 4 หมวด:
    - Business (7): CEO, CFO, CMO, Legal Counsel, CHRO, Sales Coach, Operations Manager
    - IT (8): Software Architect, Security Engineer, DevOps/SRE, Frontend, Backend, AI/ML, Data Engineer, QA Engineer, Product Manager
    - Research (4): Academic Researcher, Devil's Advocate, Market Analyst, Risk Assessor
    - General (2): Data Analyst, Synthesizer
  - **16 Skills** ต่อ agent: web_search, code_execution, data_analysis, financial_modeling, legal_research, market_research, risk_assessment, ux_review, security_audit, system_design, devops, database, api_design, testing, summarization, translation
  - **useWebSearch toggle** — เปิด/ปิด Web Search per agent
  - **Seniority slider (1–99)** — กำหนดลำดับพูดในการประชุม (1 = ประธาน, 99 = พูดท้าย)
  - เปิด/ปิด agent โดยไม่ลบ

### 2. Settings
- **หน้า:** `/settings` — ตั้งค่า API Keys สำหรับ Web Search
- **API:** `GET/POST /api/team-settings`
- **เก็บข้อมูล:** `~/.openclaw-team/settings.json` (encrypted)
- **ฟีเจอร์:**
  - Serper API Key (primary — 2,500 queries/month ฟรี)
  - SerpApi API Key (fallback — 100 queries/month ฟรี)
  - ปุ่มทดสอบ connection
  - Keys ที่ set แล้ว: Serper `...018f`, SerpApi `...a98`

### 3. Web Search Integration
- **API:** `POST /api/team-websearch`
- **Flow:** Serper → SerpApi fallback → inject ผลค้นหาเป็น context ก่อน agent ตอบ
- **ใช้งาน:** เฉพาะ agent ที่เปิด `useWebSearch = true` เท่านั้น

### 4. Meeting Room (Research Orchestration)
- **หน้า:** `/research` — ห้องประชุม AI หลัก
- **API:** `POST /api/team-research/stream` (Server-Sent Events)
- **API ประวัติ:** `GET /api/team-research`, `GET /api/team-research/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/research-history.json` (100 sessions ล่าสุด)
- **localStorage:** `research_conversation_v1` — จำ conversation ข้าม refresh
- **Meeting Flow (ปรับจาก Debate):**
  1. **Chairman Detection** — ตรวจ role/seniority อัตโนมัติ (CEO > CFO > Director > Manager...)
  2. **Chairman Opening** — ประธานเปิดประชุม ชี้แจงวัตถุประสงค์และประเด็น
  3. **Phase 1 — นำเสนอ:** agents พูดตามลำดับ seniority แต่ละคนนำเสนอมุมมองจาก soul/role จริง
  4. **Phase 2 — อภิปราย:** agents อ่านความเห็นกันแล้วแสดงจุดยืนตาม soul (เห็นด้วย/ไม่เห็นด้วย พร้อมเหตุผล) — ไม่ใช่ index คู่/คี่อีกต่อไป
  5. **Phase 3 — มติประธาน:** Chairman สรุป ประเด็นที่เห็นพ้อง + ประเด็นขัดแย้ง + มติ + Action Items
- **Web Search:** agent ที่เปิด useWebSearch จะค้นหาก่อนตอบ — แสดง "ค้นหา..." indicator
- **Token Optimization — historyMode:**
  - `full` — inject history ทุกรอบ (default สำหรับ accuracy สูงสุด)
  - `last3` — inject แค่ 3 รอบล่าสุด (แนะนำ)
  - `summary` — สรุปย่อ history (ประหยัด token)
  - `none` — ไม่ inject history (ประหยัดสุด)
- **Chart Auto-render:** AI embed JSON ใน synthesis → parse และ render Bar/Line/Pie อัตโนมัติ (ไม่ใช้ external lib)
- **Excel Sheet Selector:** เลือก inject เฉพาะ sheet ที่ต้องการจากไฟล์ Excel
- **Meeting Minutes Export:** export Markdown รูปแบบรายงานการประชุมจริง (agenda/ความเห็น/มติ/action items)
- **Follow-up Suggestions:** หลังประชุมแต่ละวาระ แสดง 3 วาระต่อเนื่องที่แนะนำ
- **Server History Sidebar:** ดูประวัติ sessions เก่าทั้งหมด

### 5. File Attachment (เอกสารอ้างอิง)
- **API:** `POST /api/team-research/upload`
- **รองรับ:** xlsx/xls/xlsm, pdf, docx/doc, csv, json, txt/md/log
- **ขนาดสูงสุด:** 10MB / 40,000 chars context
- **Excel:** parse ทุก sheet เป็น CSV, มี Sheet Selector เลือก inject เฉพาะบาง sheet
- **PDF:** pdf-parse (ESM/CJS compat fix)
- **Word:** mammoth extractRawText
- **Drag & Drop** + click to upload

### 6. Pixel Office Meeting Room
- **หน้า:** `/pixel-office-research` — ห้องประชุม pixel art แบบ visual
- **ฟีเจอร์เดียวกับ `/research`** แต่แสดงบน canvas pixel office:
  - Chairman badge บน agent pill
  - Web Search indicator ("ค้นหา..." animate)
  - historyMode selector
  - Phase labels เป็นภาษาไทย (นำเสนอ / อภิปราย / ประธานสรุปมติ)
  - Export Minutes
  - Speech bubbles / floating code snippets / data flow lines บน canvas
  - Server history panel overlay

### 7. Team Management
- **หน้า:** `/teams` — สร้าง/แก้ไข/ลบ teams
- **API:** `GET/POST /api/teams`, `PATCH/DELETE /api/teams/[id]`

### 8. Pixel Office
- **หน้า:** `/pixel-office` — pixel art office พร้อม research bar

### 9. Sidebar Navigation
- Group "Team":
  - `👥 Team Agents` → `/agents`
  - `👫 Teams` → `/teams`
  - `🔬 Research` → `/research`
  - `🏛️ Meeting Room` → `/pixel-office-research`
- Group "Config":
  - `Skills` → `/skills`
  - `⚙️ Settings` → `/settings`

---

## Architecture

```
openclaw-team-dashboard/
├── app/
│   ├── agents/page.tsx              ← Agent CRUD + 19 templates + useWebSearch + seniority
│   ├── research/page.tsx            ← Meeting Room UI (SSE, charts, file attach, minutes)
│   ├── pixel-office-research/page.tsx ← Pixel Meeting Room (canvas + same features)
│   ├── settings/page.tsx            ← Web Search API key settings
│   ├── teams/page.tsx               ← Team CRUD UI
│   ├── pixel-office/page.tsx        ← Pixel Office canvas
│   ├── api/
│   │   ├── team-agents/
│   │   │   ├── route.ts             (GET list, POST create — รับ useWebSearch, seniority)
│   │   │   └── [id]/route.ts        (PATCH update, DELETE)
│   │   ├── team-models/route.ts     (models per provider)
│   │   ├── team-settings/route.ts   (GET/POST Serper/SerpApi keys — encrypted)
│   │   ├── team-websearch/route.ts  (POST — Serper→SerpApi fallback)
│   │   ├── team-research/
│   │   │   ├── route.ts             (GET history)
│   │   │   ├── [id]/route.ts        (GET single session)
│   │   │   ├── stream/route.ts      (POST SSE — Meeting Flow 3 phases + web search + chart)
│   │   │   └── upload/route.ts      (POST multipart — parse Excel/PDF/Word/CSV/JSON/TXT)
│   │   └── teams/
│   │       ├── route.ts
│   │       └── [id]/route.ts
│   └── sidebar.tsx
├── lib/
│   └── agents-store.ts              ← File-based storage + AES-256 + Settings store
└── PLAN.md
```

### Data Files (บน server)
```
~/.openclaw-team/
├── agents.json           ← agent configs (API keys + useWebSearch + seniority encrypted)
├── teams.json
├── settings.json         ← Serper/SerpApi keys (encrypted)
└── research-history.json ← 100 sessions ล่าสุด
```

### SSE Events (stream/route.ts)
| Event | Data | คำอธิบาย |
|-------|------|---------|
| `session` | `{sessionId}` | เริ่ม session |
| `chairman` | `{agentId, name, emoji, role}` | ประกาศประธาน |
| `status` | `{message}` | สถานะ phase |
| `agent_start` | `{agentId, isChairman}` | agent เริ่มทำงาน |
| `agent_searching` | `{agentId, query}` | agent กำลัง web search |
| `message` | `ResearchMessage` | ข้อความจาก agent |
| `agent_tokens` | `{agentId, inputTokens, outputTokens, totalTokens}` | token usage |
| `final_answer` | `{content}` | มติสุดท้าย |
| `chart_data` | `{type, title, labels, datasets}` | ข้อมูลกราฟ |
| `follow_up_suggestions` | `{suggestions: string[]}` | วาระต่อเนื่อง 3 ข้อ |
| `done` | `{sessionId}` | เสร็จสิ้น |

### Providers และ Models ที่รองรับ
| Provider | Model ตัวอย่าง | API Format |
|----------|---------------|-----------|
| Anthropic | Claude Opus/Sonnet/Haiku 4.x | Anthropic SDK |
| OpenAI | GPT-4o, o1, o3-mini | OpenAI SDK |
| Gemini | Gemini 2.0 Flash/Pro | Google GenAI SDK |
| Ollama | Llama 3.2, Mistral, Qwen 2.5 | OpenAI-compatible |
| OpenRouter | Claude/GPT/Gemini/Llama/DeepSeek | OpenAI-compatible + Bearer |
| Custom | custom-model | OpenAI-compatible |

---

## Server & Deployment

- **Server:** `bosscatdog@192.168.2.109` (password: boss123456)
- **Port:** 3001
- **Repo:** https://github.com/bosocmputer/openclaw-team-dashboard

### Deploy Command (ทำทุกครั้งที่ update)
```bash
# Pull + clean rebuild + copy static + start
sshpass -p boss123456 ssh -o StrictHostKeyChecking=no bosscatdog@192.168.2.109 "
  kill \$(ss -tlnp 2>/dev/null | grep 3001 | grep -oP 'pid=\K[0-9]+') 2>/dev/null || true
  cd ~/openclaw-team-dashboard && git pull origin main && rm -rf .next && npm run build
  cp -r .next/static .next/standalone/.next/static
  nohup env PORT=3001 node .next/standalone/server.js >> /tmp/team-dashboard.log 2>&1 & disown
"
```

> ⚠️ **สำคัญ:** ต้อง `cp -r .next/static .next/standalone/.next/static` ทุกครั้ง ไม่งั้นจะเกิด ChunkLoadError 404

### Save Web Search Keys (ทำครั้งเดียว — บันทึกแล้ว)
```bash
curl -X POST http://192.168.2.109:3001/api/team-settings \
  -H 'content-type: application/json' \
  -d '{"serperApiKey":"f5e5101f...","serpApiKey":"1e677b3f..."}'
```

---

## Phase ถัดไป (ยังไม่ได้ทำ)

### Phase 4 — MCP & Database Connector
- เปิดใช้ Data Source selector จริงใน Meeting Room
- MCP Server connector (ระบุ endpoint)
- Database connector (MySQL/PostgreSQL read-only)

### Phase 5 — Pixel Office Visualization
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
