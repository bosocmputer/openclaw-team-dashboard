# OpenClaw Team Dashboard — Project Plan

> อ้างอิงเอกสารนี้เมื่อ token หมดหรือเริ่ม session ใหม่

---

## สิ่งที่สร้างแล้ว (Phase 1 & 2 — สมบูรณ์)

### 1. Agent Management System
- **หน้า:** `/agents` — สร้าง/แก้ไข/ลบ/เปิด-ปิด agents
- **API:** `GET/POST /api/team-agents`, `PATCH/DELETE /api/team-agents/[id]`
- **เก็บข้อมูล:** `~/.openclaw-team/agents.json` (ไม่มี DB)
- **ฟีเจอร์:**
  - เลือก Provider: Anthropic / OpenAI / Gemini / Ollama / Custom
  - ใส่ API Key (encrypt ด้วย AES-256-CBC)
  - เลือก Model (โหลดจาก `/api/team-models?provider=xxx`)
  - ตั้ง Base URL สำหรับ Ollama/Custom
  - ตั้ง Soul (System Prompt) — บุคลิกและบทบาทของ agent
  - Soul Templates: Researcher 🔍 / Analyst 📊 / Synthesizer ✍️ / Critic 🎯 / Custom
  - เปิด/ปิด agent โดยไม่ลบ

### 2. Research Orchestration
- **หน้า:** `/research` — ส่งคำถาม ดูผล real-time
- **API:** `POST /api/team-research/stream` (Server-Sent Events)
- **หน้าประวัติ:** `GET /api/team-research`
- **เก็บข้อมูล:** `~/.openclaw-team/research-history.json` (100 sessions ล่าสุด)
- **Flow การทำงาน:**
  1. **Phase 1 — Independent Research:** แต่ละ agent call LLM API ของตัวเอง วิเคราะห์คำถามจาก soul/role ของตน
  2. **Phase 2 — Cross Discussion:** agents อ่านผลของกันและกัน แล้วแสดงความเห็นเพิ่มเติม
  3. **Phase 3 — Synthesis:** agent ตัวสุดท้าย synthesize เป็นคำตอบสุดท้าย
- **ดู token ต่อ agent:** แสดง input/output/total tokens แยกต่อ agent
- **Data Source selector:** ปัจจุบัน None เท่านั้น (Phase 3 จะเพิ่ม MCP/DB)

### 3. Pixel Office Integration
- **เพิ่ม Research Bar** ที่ด้านล่างของ Pixel Office
- **Agent pills** — เลือก/ยกเลิก agents ที่ต้องการส่งคำถามถึง
- **Input box** — พิมพ์คำถาม Enter เพื่อส่ง
- **Panel ขยาย** — เห็น messages และ token ของแต่ละ agent แบบ real-time
- **Token counter** แสดงเหนือแต่ละ agent pill
- **ลิงก์ไป /research** เพื่อดูคำตอบเต็ม

### 4. Sidebar Navigation
- เพิ่ม group "Team" ที่ด้านบนสุด
- `👥 Team Agents` → `/agents`
- `🔬 Research` → `/research`

---

## Architecture

```
openclaw-team-dashboard/
├── app/
│   ├── agents/page.tsx          ← Agent CRUD UI
│   ├── research/page.tsx        ← Research UI (SSE streaming)
│   ├── pixel-office/page.tsx    ← เพิ่ม PixelOfficeResearchBar component
│   ├── api/
│   │   ├── team-agents/         ← CRUD API
│   │   │   ├── route.ts         (GET list, POST create)
│   │   │   └── [id]/route.ts   (PATCH update, DELETE)
│   │   ├── team-models/         ← Models per provider
│   │   │   └── route.ts
│   │   └── team-research/
│   │       ├── route.ts         ← GET history
│   │       └── stream/route.ts  ← POST SSE orchestration
│   └── sidebar.tsx              ← เพิ่ม teamAgents + research nav
├── lib/
│   └── agents-store.ts          ← File-based storage + AES-256 encryption
└── PLAN.md                      ← เอกสารนี้
```

### Data Files (บน server)
```
~/.openclaw-team/
├── agents.json           ← agent configs (API keys encrypted)
└── research-history.json ← 100 sessions ล่าสุด
```

---

## Server & Deployment

- **Server:** `bosscatdog@192.168.2.109` (password: boss123456)
- **SSH:** `sshpass -p boss123456 ssh bosscatdog@192.168.2.109`
- **Repo:** https://github.com/bosocmputer/openclaw-team-dashboard
- **Port:** 3001 (ไม่ชนกับ openclaw-admin/openclaw-api)
- **Start:** `npm run dev -- --port 3001` หรือ `npm start -- --port 3001`

### Deploy ครั้งแรก
```bash
ssh bosscatdog@192.168.2.109
cd ~
git clone https://github.com/bosocmputer/openclaw-team-dashboard.git
cd openclaw-team-dashboard
npm install
npm run build
# รัน background
nohup npm start -- --port 3001 > /tmp/team-dashboard.log 2>&1 &
```

### Update (git pull)
```bash
ssh bosscatdog@192.168.2.109
cd ~/openclaw-team-dashboard
git pull origin main
npm install
npm run build
# restart process
pkill -f "next start" || true
nohup npm start -- --port 3001 > /tmp/team-dashboard.log 2>&1 &
```

---

## ความสัมพันธ์กับ openclaw-admin และ openclaw-api

| Project | Port | ทำอะไร | ใช้ OpenClaw CLI? |
|---------|------|--------|-----------------|
| openclaw-api | (ไม่ทราบ) | Backend API | อาจใช้ |
| openclaw-admin | (ไม่ทราบ) | Admin panel | อาจใช้ |
| **openclaw-team-dashboard** | **3001** | Multi-agent research dashboard | **ไม่ใช้** — call LLM APIs โดยตรง |

**ใช้ร่วมกันได้** — openclaw-team-dashboard เป็น standalone app ที่:
- Call Anthropic/OpenAI/Gemini/Ollama APIs โดยตรง (ไม่ผ่าน OpenClaw gateway)
- เก็บข้อมูลใน `~/.openclaw-team/` แยกจาก `~/.openclaw/`
- ไม่มี dependency กับ openclaw-admin หรือ openclaw-api
- รันบน port ต่างกัน ไม่ conflict

---

## Phase ถัดไป (ยังไม่ได้ทำ)

### Phase 3 — MCP & Database Connector
- เพิ่ม MCP Server connector (ระบุ endpoint)
- เพิ่ม Database connector (MySQL/PostgreSQL — read-only สำหรับ context)
- เปิดใช้ Data Source selector ใน Research และ Pixel Office

### Phase 4 — Pixel Office Visualization
- Speech bubbles แสดง conversation ระหว่าง agents บน canvas
- Data flow lines/arrows ระหว่าง agent characters ตอน communicate
- Thinking animation (ฟองอากาศ ...) ตอน agent กำลัง process

### Phase 5 — Team Management
- สร้าง "Teams" — จัดกลุ่ม agents สำหรับ task ต่างๆ
- Default team สำหรับ research
- บันทึก team config แยกต่างหาก

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
5. **Soul templates** มี 4 แบบสำเร็จรูป + Custom
6. **Model list** โหลดอัตโนมัติตาม provider ที่เลือก
