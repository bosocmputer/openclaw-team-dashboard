# OpenClaw Team Dashboard — Project Plan

> อ้างอิงเอกสารนี้เมื่อ token หมดหรือเริ่ม session ใหม่

---

## สิ่งที่สร้างแล้ว (Phase 1–3 — สมบูรณ์)

### 1. Agent Management System
- **หน้า:** `/agents` — สร้าง/แก้ไข/ลบ/เปิด-ปิด agents
- **API:** `GET/POST /api/team-agents`, `PATCH/DELETE /api/team-agents/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/agents.json` (ไม่มี DB)
- **ฟีเจอร์:**
  - เลือก Provider: Anthropic / OpenAI / Gemini / Ollama / **OpenRouter** / Custom
  - ใส่ API Key (encrypt ด้วย AES-256-CBC)
  - เลือก Model (โหลดจาก `/api/team-models?provider=xxx`)
  - ตั้ง Base URL สำหรับ Ollama/Custom
  - ตั้ง Soul (System Prompt) — บุคลิกและบทบาทของ agent
  - Soul Templates (6 แบบ + Custom):
    - Researcher 🔍 — จุดยืน: หลักฐานก่อนเสมอ โจมตีข้อสรุปที่ไม่มีข้อมูล
    - Analyst 📊 — จุดยืน: เชื่อตัวเลข/แนวโน้ม โต้แย้งคนมองโลกสุดขั้ว
    - Synthesizer ✍️ — จุดยืน: ทั้งสองฝ่ายผิด ชี้จุดอ่อนก่อนเสนอทางที่สาม
    - Critic 🎯 — จุดยืน: คนประเมินความเสี่ยงต่ำเกิน ไม่เชื่อ consensus
    - Optimist 🚀 — จุดยืน: เทคโนโลยีแก้ได้ทุกอย่าง โต้แย้งคนกลัวการเปลี่ยนแปลง
    - Pessimist ⚠️ — จุดยืน: ระบบซับซ้อนพังเสมอ โจมตีทุก assumption ที่มองข้ามความเสี่ยง
    - Custom 🤖 — กำหนดเอง
  - เปิด/ปิด agent โดยไม่ลบ

### 2. Research Orchestration
- **หน้า:** `/research` — ส่งคำถาม ดูผล real-time
- **API:** `POST /api/team-research/stream` (Server-Sent Events)
- **API ประวัติ:** `GET /api/team-research`, `GET /api/team-research/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/research-history.json` (100 sessions ล่าสุด)
- **Flow การทำงาน:**
  1. **Phase 1 — Independent Research:** แต่ละ agent call LLM API ของตัวเอง วิเคราะห์คำถามจาก soul/role ของตน
  2. **Phase 2 — Forced Debate:** agents ถูกแบ่งเป็นฝ่าย (index คู่ = สนับสนุน, index คี่ = คัดค้าน) อ่านผลกันแล้วโต้แย้งอย่างน้อย 2 ประเด็น — stance ถูก inject เข้า system prompt เพื่อบังคับไม่ให้ echo chamber
  3. **Phase 3 — Synthesis:** agent ตัวสุดท้าย synthesize โดยระบุประเด็นที่เห็นตรงกันและประเด็นที่ยังขัดแย้ง
- **Token tracking:** แสดง input/output/total tokens แยกต่อ agent
- **Data Source selector:** ปัจจุบัน None เท่านั้น

### 3. Team Management
- **หน้า:** `/teams` — สร้าง/แก้ไข/ลบ teams
- **API:** `GET/POST /api/teams`, `PATCH/DELETE /api/teams/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/teams.json`
- **ฟีเจอร์:** จัดกลุ่ม agents เป็น team สำหรับ task ต่างๆ

### 4. Pixel Office Integration
- **เพิ่ม Research Bar** ที่ด้านล่างของ Pixel Office
- **Agent pills** — เลือก/ยกเลิก agents ที่ต้องการส่งคำถาม
- **Input box** — พิมพ์คำถาม Enter เพื่อส่ง
- **Panel ขยาย** — เห็น messages และ token ของแต่ละ agent แบบ real-time
- **Token counter** แสดงเหนือแต่ละ agent pill
- **ลิงก์ไป /research** เพื่อดูคำตอบเต็ม

### 5. Sidebar Navigation
- Group "Team" ที่ด้านบนสุด:
  - `👥 Team Agents` → `/agents`
  - `🔬 Research` → `/research`
  - `👫 Teams` → `/teams`

---

## Architecture

```
openclaw-team-dashboard/
├── app/
│   ├── agents/page.tsx          ← Agent CRUD UI + Soul Templates (6 แบบ)
│   ├── research/page.tsx        ← Research UI (SSE streaming)
│   ├── teams/page.tsx           ← Team CRUD UI
│   ├── pixel-office/page.tsx    ← มี PixelOfficeResearchBar component
│   ├── api/
│   │   ├── team-agents/
│   │   │   ├── route.ts         (GET list, POST create)
│   │   │   └── [id]/route.ts   (PATCH update, DELETE)
│   │   ├── team-models/
│   │   │   └── route.ts         (models per provider)
│   │   ├── team-research/
│   │   │   ├── route.ts         (GET history)
│   │   │   ├── [id]/route.ts   (GET single session)
│   │   │   └── stream/route.ts  (POST SSE orchestration — 3 phases)
│   │   └── teams/
│   │       ├── route.ts         (GET list, POST create)
│   │       └── [id]/route.ts   (PATCH update, DELETE)
│   └── sidebar.tsx
├── lib/
│   └── agents-store.ts          ← File-based storage + AES-256 encryption
└── PLAN.md                      ← เอกสารนี้
```

### Data Files (บน server)
```
~/.openclaw-team/
├── agents.json           ← agent configs (API keys encrypted)
├── teams.json            ← team configs
└── research-history.json ← 100 sessions ล่าสุด
```

### Providers และ Models ที่รองรับ
| Provider | Model ตัวอย่าง | API Format |
|----------|---------------|-----------|
| Anthropic | Claude Opus/Sonnet/Haiku 4.x | Anthropic SDK |
| OpenAI | GPT-4o, o1, o3-mini | OpenAI SDK |
| Gemini | Gemini 2.0 Flash/Pro, 1.5 Pro | Google GenAI SDK |
| Ollama | Llama 3.2, Mistral, Qwen 2.5 | OpenAI-compatible |
| **OpenRouter** | Claude/GPT/Gemini/Llama/DeepSeek/Qwen | OpenAI-compatible + Bearer token |
| Custom | custom-model | OpenAI-compatible |

---

## Server & Deployment

- **Server:** `bosscatdog@192.168.2.109` (password: boss123456)
- **SSH:** `sshpass -p boss123456 ssh bosscatdog@192.168.2.109`
- **Repo:** https://github.com/bosocmputer/openclaw-team-dashboard
- **Port:** 3001 (ไม่ชนกับ openclaw-admin/openclaw-api)

### Deploy / Update
```bash
sshpass -p boss123456 ssh bosscatdog@192.168.2.109 "cd ~/openclaw-team-dashboard && git pull origin main && npm install && npm run build"
# restart
sshpass -p boss123456 ssh bosscatdog@192.168.2.109 "kill \$(ss -tlnp | grep 3001 | grep -oP 'pid=\K[0-9]+') 2>/dev/null; cd ~/openclaw-team-dashboard && nohup npm start -- --port 3001 > /tmp/team-dashboard.log 2>&1 &"
```

> ⚠️ ถ้า browser เห็น `ChunkLoadError` หลัง deploy — ต้องทำ clean rebuild:
> ```bash
> sshpass -p boss123456 ssh bosscatdog@192.168.2.109 "kill \$(ss -tlnp | grep 3001 | grep -oP 'pid=\K[0-9]+') 2>/dev/null; rm -rf ~/openclaw-team-dashboard/.next && cd ~/openclaw-team-dashboard && npm run build && nohup npm start -- --port 3001 > /tmp/team-dashboard.log 2>&1 &"
> ```

---

## OpenClaw Gateway — การตั้งค่าและปัญหาที่พบ

### Architecture

- **Gateway process:** `openclaw-gateway` รันบน `127.0.0.1:18789` (loopback only — เข้าจากภายนอกตรงๆ ไม่ได้)
- **Public access:** ผ่าน Cloudflare Tunnel → `https://<random>.trycloudflare.com`
  - ⚠️ URL นี้เปลี่ยนทุกครั้งที่ restart cloudflared (Quick Tunnel)
  - Tunnel process pid ดูได้ด้วย `ps aux | grep cloudflared`
- **Restart gateway:** `kill <pid>; nohup openclaw gateway run > /tmp/openclaw-gateway.log 2>&1 &`

### Config ที่จำเป็น (~/.openclaw/openclaw.json)

```json
{
  "gateway": {
    "mode": "local",
    "auth": { "mode": "token", "token": "..." },
    "controlUi": {
      "allowedOrigins": ["*"]
    }
  }
}
```

> ถ้าไม่มี `controlUi.allowedOrigins` จะได้ error **"origin not allowed"** เมื่อเปิด Control UI ผ่าน Cloudflare

### วิธีเปิด Control UI จากภายนอก

ใช้ URL พร้อม token ฝังอยู่ (ไม่ต้องกรอก token ในหน้า UI):

```
https://<cloudflare-tunnel-url>/#token=<gateway-token>
```

Token ดูได้จาก: `openclaw dashboard`

### ปัญหาที่พบและวิธีแก้

| ปัญหา | สาเหตุ | วิธีแก้ |
|-------|--------|--------|
| ERR_CONNECTION_TIMED_OUT บน :18789 | port bound กับ 127.0.0.1 เท่านั้น | ใช้ Cloudflare Tunnel URL แทน |
| "origin not allowed" | ไม่มี `controlUi.allowedOrigins` ใน config | เพิ่ม `"allowedOrigins": ["*"]` แล้ว restart gateway |
| "pairing required" | เปิด URL โดยไม่มี `#token=...` | ใช้ URL ที่มี token ฝัง |
| Browser ใหม่ต้องรอ approve | Device ยังไม่ได้ paired | `openclaw devices list` → `openclaw devices approve <requestId>` |

### Device Management

```bash
openclaw devices list
openclaw devices approve <requestId>
openclaw sessions
```

---

## ความสัมพันธ์กับ openclaw-admin และ openclaw-api

| Project | Port | ทำอะไร | ใช้ OpenClaw CLI? |
|---------|------|--------|-----------------|
| openclaw-api | (ไม่ทราบ) | Backend API | อาจใช้ |
| openclaw-admin | (ไม่ทราบ) | Admin panel | อาจใช้ |
| **openclaw-team-dashboard** | **3001** | Multi-agent research dashboard | **ไม่ใช้** — call LLM APIs โดยตรง |

openclaw-team-dashboard เป็น standalone app:
- Call Anthropic/OpenAI/Gemini/Ollama/OpenRouter APIs โดยตรง
- เก็บข้อมูลใน `~/.openclaw-team/` แยกจาก `~/.openclaw/`
- ไม่มี dependency กับ openclaw-admin หรือ openclaw-api
- รันบน port ต่างกัน ไม่ conflict

---

## Phase ถัดไป (ยังไม่ได้ทำ)

### Phase 4 — MCP & Database Connector
- เพิ่ม MCP Server connector (ระบุ endpoint)
- เพิ่ม Database connector (MySQL/PostgreSQL — read-only สำหรับ context)
- เปิดใช้ Data Source selector ใน Research และ Pixel Office

### Phase 5 — Pixel Office Visualization
- Speech bubbles แสดง conversation ระหว่าง agents บน canvas
- Data flow lines/arrows ระหว่าง agent characters ตอน communicate
- Thinking animation (ฟองอากาศ ...) ตอน agent กำลัง process

---

## Environment Variables (Optional)

```env
# เปลี่ยน encryption key (แนะนำสำหรับ production)
AGENT_ENCRYPT_KEY=your-32-character-secret-key-here

# เปลี่ยน path เก็บข้อมูล
HOME=/custom/path  # ~/.openclaw-team จะตามไปด้วย
```

---

## หมายเหตุสำคัญ

1. **API Keys** เก็บแบบ encrypted (AES-256-CBC) ใน `~/.openclaw-team/agents.json`
2. **ไม่มี database** — ทุกอย่างเป็น JSON files
3. **SSE Streaming** — research ใช้ Server-Sent Events ทำให้เห็น real-time
4. **Session limit** — เก็บ research history 100 sessions ล่าสุด auto-trim
5. **Soul templates** มี 6 แบบสำเร็จรูป + Custom แต่ละแบบมีจุดยืนขัดแย้งกัน
6. **Phase 2 Forced Debate** — index คู่ = ฝ่ายสนับสนุน, index คี่ = ฝ่ายคัดค้าน inject เข้า system prompt
7. **Model list** โหลดอัตโนมัติตาม provider ที่เลือก
8. **ChunkLoadError หลัง deploy** — ต้องทำ clean rebuild (`rm -rf .next`) ไม่ใช่แค่ restart
