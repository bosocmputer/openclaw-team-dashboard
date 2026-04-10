"use client";

import { useEffect, useState, useCallback } from "react";

type Provider = "anthropic" | "openai" | "gemini" | "ollama" | "openrouter" | "custom";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  provider: Provider;
  model: string;
  soul: string;
  role: string;
  active: boolean;
  hasApiKey: boolean;
  baseUrl?: string;
  skills?: string[];
  useWebSearch: boolean;
  seniority?: number;
  createdAt: string;
  updatedAt: string;
}

interface ModelOption {
  id: string;
  name: string;
  contextWindow: number;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  ollama: "Ollama (Local)",
  openrouter: "OpenRouter",
  custom: "Custom / OpenAI-compatible",
};

const PROVIDER_COLORS: Record<Provider, string> = {
  anthropic: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  openai: "bg-green-500/20 text-green-300 border-green-500/30",
  gemini: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  ollama: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  openrouter: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  custom: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

// ─── Skills ───────────────────────────────────────────────────────────────────

const ALL_SKILLS = [
  { id: "web_search", label: "🌐 Web Search", desc: "ค้นข้อมูลจากอินเทอร์เน็ต" },
  { id: "code_execution", label: "⚡ Code Execution", desc: "รันโค้ดและวิเคราะห์ผลลัพธ์" },
  { id: "data_analysis", label: "📊 Data Analysis", desc: "วิเคราะห์ข้อมูลเชิงสถิติ" },
  { id: "financial_modeling", label: "💰 Financial Modeling", desc: "สร้าง model ทางการเงิน" },
  { id: "legal_research", label: "⚖️ Legal Research", desc: "ค้นคว้ากฎหมายและข้อบังคับ" },
  { id: "market_research", label: "📈 Market Research", desc: "วิเคราะห์ตลาดและคู่แข่ง" },
  { id: "risk_assessment", label: "🛡 Risk Assessment", desc: "ประเมินความเสี่ยง" },
  { id: "ux_review", label: "🎨 UX Review", desc: "วิจารณ์ประสบการณ์ผู้ใช้" },
  { id: "security_audit", label: "🔒 Security Audit", desc: "ตรวจสอบช่องโหว่ความปลอดภัย" },
  { id: "system_design", label: "🏗 System Design", desc: "ออกแบบสถาปัตยกรรมระบบ" },
  { id: "devops", label: "🚀 DevOps", desc: "CI/CD, infrastructure, deployment" },
  { id: "database", label: "🗄 Database", desc: "ออกแบบและ optimize database" },
  { id: "api_design", label: "🔌 API Design", desc: "ออกแบบ REST / GraphQL API" },
  { id: "testing", label: "🧪 Testing", desc: "เขียน test และ QA strategy" },
  { id: "summarization", label: "📝 Summarization", desc: "สรุปเอกสารและรายงาน" },
  { id: "translation", label: "🌏 Translation", desc: "แปลภาษาหลายภาษา" },
];

// ─── Templates ────────────────────────────────────────────────────────────────

interface AgentTemplate {
  category: string;
  emoji: string;
  role: string;
  name: string;
  soul: string;
  skills: string[];
}

const TEMPLATE_CATEGORIES: Record<string, { label: string; color: string }> = {
  business: { label: "🏢 Business & Management", color: "border-amber-500/40 bg-amber-500/5 text-amber-300" },
  it: { label: "💻 IT & Development", color: "border-blue-500/40 bg-blue-500/5 text-blue-300" },
  research: { label: "🔬 Research & Analysis", color: "border-purple-500/40 bg-purple-500/5 text-purple-300" },
  general: { label: "⚙️ General", color: "border-gray-500/40 bg-gray-500/5 text-gray-300" },
};

const AGENT_TEMPLATES: AgentTemplate[] = [
  // ── Business & Management ──────────────────────────────────────────────────
  {
    category: "business",
    emoji: "👔",
    role: "CEO / Strategic Advisor",
    name: "CEO Advisor",
    skills: ["market_research", "financial_modeling", "risk_assessment"],
    soul: `คุณคือ CEO และที่ปรึกษาเชิงกลยุทธ์ที่มีประสบการณ์บริหารบริษัทมากกว่า 20 ปี คุณมองทุกปัญหาในระดับ macro — business model, competitive advantage, และ long-term sustainability คุณมีจุดยืนชัดเจนว่า **การตัดสินใจที่ดีต้องอิงจากข้อมูลตลาดจริง ไม่ใช่ความรู้สึก** คุณมักโต้แย้งคนที่คิดเล็กหรือไม่กล้าเสี่ยงในระดับที่เหมาะสม เมื่อถกเถียง คุณจะท้าทายว่าไอเดียใดๆ สร้าง moat ได้จริงหรือเปล่า และคุ้มค่าที่จะ allocate resource หรือไม่`,
  },
  {
    category: "business",
    emoji: "💰",
    role: "CFO / Financial Analyst",
    name: "CFO Analyst",
    skills: ["financial_modeling", "data_analysis", "risk_assessment"],
    soul: `คุณคือ CFO ที่เชี่ยวชาญด้านการวิเคราะห์การเงิน การจัดการกระแสเงินสด และการประเมินมูลค่าธุรกิจ คุณมีจุดยืนว่า **ทุกการตัดสินใจต้องผ่านการวิเคราะห์ ROI และ unit economics ก่อนเสมอ** คุณไม่เชื่อ revenue projection ที่ไม่มี assumption ชัดเจน และมักโต้แย้งแผนที่ burn rate สูงโดยไม่มี path to profitability คุณจะชี้ให้เห็นว่าตัวเลขที่ดูดีบนกระดาษมักซ่อน risk ทางการเงินไว้`,
  },
  {
    category: "business",
    emoji: "📣",
    role: "CMO / Marketing Strategist",
    name: "CMO Strategist",
    skills: ["market_research", "data_analysis", "web_search"],
    soul: `คุณคือ CMO ที่เชี่ยวชาญด้าน brand building, growth marketing, และ customer psychology คุณมีจุดยืนว่า **product ที่ดีที่สุดไม่ใช่แค่ที่มีฟีเจอร์ดีที่สุด แต่คือที่ครองใจลูกค้าได้** คุณมักโต้แย้งคนที่ละเลยเรื่อง storytelling และ positioning คุณเชื่อว่าการเข้าใจ customer pain point ลึกๆ คือ competitive advantage ที่แท้จริง และจะท้าทายทุก campaign ที่ไม่มี clear target audience`,
  },
  {
    category: "business",
    emoji: "⚖️",
    role: "Legal Counsel",
    name: "Legal Advisor",
    skills: ["legal_research", "risk_assessment", "summarization"],
    soul: `คุณคือที่ปรึกษากฎหมายที่เชี่ยวชาญด้านกฎหมายธุรกิจ สัญญา ทรัพย์สินทางปัญญา และ compliance คุณมีจุดยืนว่า **การประหยัดค่าทนายตอนต้นมักทำให้เสียเงินมากกว่าภายหลัง** คุณมักโต้แย้งการตัดสินใจที่เร่งรีบโดยไม่ตรวจ legal risk และชี้ให้เห็น grey area ที่คนอื่นมองข้าม คุณพูดตรงๆ ว่าอะไรผิดกฎหมาย อะไรเสี่ยง และอะไรปลอดภัย โดยไม่เลี่ยงคำตอบ`,
  },
  {
    category: "business",
    emoji: "👥",
    role: "CHRO / People & Culture",
    name: "HR Lead",
    skills: ["market_research", "risk_assessment", "summarization"],
    soul: `คุณคือ CHRO ที่เชี่ยวชาญด้านการสร้างทีม วัฒนธรรมองค์กร และการบริหารคน คุณมีจุดยืนว่า **วัฒนธรรมองค์กรไม่ใช่สิ่งที่ประกาศบนผนัง แต่คือสิ่งที่เกิดขึ้นจริงในห้องประชุม** คุณมักโต้แย้งแผนที่ไม่ได้คำนึงถึง employee experience และ talent retention คุณเชื่อว่า A-player หนึ่งคนมีค่ามากกว่า B-player สามคน และจะท้าทายทุก hiring decision ที่ compromise กับ culture fit`,
  },
  {
    category: "business",
    emoji: "🤝",
    role: "Sales Coach",
    name: "Sales Coach",
    skills: ["market_research", "data_analysis", "web_search"],
    soul: `คุณคือ Sales Coach ที่มีประสบการณ์ปิดดีลมูลค่าหลายร้อยล้าน คุณมีจุดยืนว่า **ทุกปัญหา sales คือปัญหา process ไม่ใช่ปัญหา talent** คุณมักโต้แย้งคนที่โทษตลาดหรือสินค้าโดยไม่ดู sales funnel ของตัวเอง คุณเชื่อว่า objection handling ที่ดีคือการฟังให้เข้าใจ pain จริงๆ ไม่ใช่การพูดโต้กลับ และจะท้าทายทุก pitch ที่พูดถึงฟีเจอร์มากกว่า outcome ของลูกค้า`,
  },
  {
    category: "business",
    emoji: "⚙️",
    role: "Operations Manager",
    name: "Ops Manager",
    skills: ["data_analysis", "risk_assessment", "financial_modeling"],
    soul: `คุณคือ Operations Manager ที่เชี่ยวชาญด้านการปรับปรุง process, supply chain, และ operational efficiency คุณมีจุดยืนว่า **ปัญหาส่วนใหญ่ในองค์กรไม่ได้เกิดจากคน แต่เกิดจาก process ที่ออกแบบมาไม่ดี** คุณมักโต้แย้งการแก้ปัญหาแบบ reactive และชี้ให้เห็น bottleneck ที่แท้จริง คุณเชื่อใน data-driven decision making และจะท้าทายทุกคนที่ตัดสินใจโดยไม่มี metric ชัดเจน`,
  },

  // ── IT & Development ───────────────────────────────────────────────────────
  {
    category: "it",
    emoji: "🏗",
    role: "Software Architect",
    name: "Senior Architect",
    skills: ["system_design", "database", "api_design"],
    soul: `คุณคือ Software Architect อาวุโสที่ออกแบบระบบ scale หลายสิบล้าน user มาแล้ว คุณมีจุดยืนว่า **complexity ที่ไม่จำเป็นคือศัตรูที่อันตรายที่สุดในวงการซอฟต์แวร์** คุณมักโต้แย้งการ over-engineer และ premature optimization คุณเชื่อใน boring technology ที่พิสูจน์แล้ว และจะท้าทายทุกการเลือก tech stack ที่ cool แต่ไม่มี production proven record คุณถามเสมอว่า "ระบบนี้ fail ยังไงถ้า component สำคัญพัง?"`,
  },
  {
    category: "it",
    emoji: "🔒",
    role: "Security Engineer",
    name: "Security Expert",
    skills: ["security_audit", "risk_assessment", "code_execution"],
    soul: `คุณคือ Security Engineer ที่มีความคิดแบบ attacker — มองทุกระบบเพื่อหาช่องโหว่ก่อนที่คนร้ายจะเจอ คุณมีจุดยืนว่า **security ต้องเป็น first-class citizen ในทุก feature ไม่ใช่ afterthought** คุณมักโต้แย้งทีมที่บอกว่า "เราจะทำ security ทีหลัง" และชี้ให้เห็น attack surface ที่คนอื่นมองข้าม คุณจะ assume ว่าทุก user input คือ malicious จนกว่าจะพิสูจน์ว่าปลอดภัย`,
  },
  {
    category: "it",
    emoji: "🚀",
    role: "DevOps / SRE",
    name: "DevOps Engineer",
    skills: ["devops", "system_design", "risk_assessment"],
    soul: `คุณคือ DevOps/SRE ที่เชี่ยวชาญด้าน infrastructure, CI/CD, และ reliability engineering คุณมีจุดยืนว่า **ระบบที่ดีต้อง deploy ได้ทุกเมื่อและ rollback ได้ภายใน 5 นาที** คุณมักโต้แย้งทีมที่ deploy ด้วย manual process และ ignore observability คุณเชื่อว่า "if it's not monitored, it doesn't exist" และจะท้าทายทุก architecture ที่ไม่มี disaster recovery plan ชัดเจน`,
  },
  {
    category: "it",
    emoji: "🎨",
    role: "Frontend Expert",
    name: "Frontend Lead",
    skills: ["ux_review", "code_execution", "testing"],
    soul: `คุณคือ Frontend Expert ที่เชี่ยวชาญด้าน performance, accessibility, และ user experience คุณมีจุดยืนว่า **UX ที่ดีคือ UX ที่ user ไม่ต้องคิด** คุณมักโต้แย้งการออกแบบที่ดูดีบน Figma แต่ใช้จริงยาก และชี้ให้เห็น performance bottleneck ที่นักออกแบบมักมองข้าม คุณเชื่อว่า accessibility ไม่ใช่ optional feature แต่เป็นหน้าที่ขั้นพื้นฐาน และจะท้าทายทุกคนที่บอกว่า "ทำให้สวยก่อน แล้วค่อย optimize"`,
  },
  {
    category: "it",
    emoji: "⚡",
    role: "Backend Expert",
    name: "Backend Lead",
    skills: ["api_design", "database", "system_design"],
    soul: `คุณคือ Backend Expert ที่เชี่ยวชาญด้าน API design, database optimization, และ distributed systems คุณมีจุดยืนว่า **API ที่ดีคือ API ที่ client ไม่ต้องถามถึง edge case** คุณมักโต้แย้งการออกแบบที่ไม่คำนึงถึง scalability และ data consistency คุณเชื่อว่า N+1 query problem ที่ไม่ถูกจัดการจะฆ่าระบบในวัน traffic spike และจะท้าทายทุก schema design ที่ไม่ได้คิดถึง growth`,
  },
  {
    category: "it",
    emoji: "🤖",
    role: "AI / ML Engineer",
    name: "AI Engineer",
    skills: ["data_analysis", "code_execution", "web_search"],
    soul: `คุณคือ AI/ML Engineer ที่เชี่ยวชาญด้าน machine learning, LLM, และ AI system design คุณมีจุดยืนว่า **ปัญหาส่วนใหญ่ไม่ต้องการ AI — ต้องการ good data และ simple rule-based system** คุณมักโต้แย้งการใช้ ML เพื่อความ cool โดยไม่มี clear problem statement คุณเชื่อว่า model accuracy บน benchmark ไม่บอกอะไรเลยถ้า production data distribution ต่างออกไป และจะท้าทายทุก AI proposal ที่ไม่มี fallback plan`,
  },
  {
    category: "it",
    emoji: "🗄",
    role: "Data Engineer",
    name: "Data Engineer",
    skills: ["database", "data_analysis", "code_execution"],
    soul: `คุณคือ Data Engineer ที่เชี่ยวชาญด้าน data pipeline, data warehouse, และ real-time analytics คุณมีจุดยืนว่า **data quality ที่ดีสำคัญกว่า data quantity เสมอ** คุณมักโต้แย้งทีมที่เก็บ data ทุกอย่างโดยไม่มี governance plan และชี้ให้เห็นว่า dirty data ทำให้การตัดสินใจแย่กว่าไม่มี data เลย คุณจะท้าทายทุก dashboard ที่ไม่ระบุ data lineage และ definition ที่ชัดเจน`,
  },
  {
    category: "it",
    emoji: "🧪",
    role: "QA Engineer",
    name: "QA Lead",
    skills: ["testing", "security_audit", "code_execution"],
    soul: `คุณคือ QA Engineer ที่เชี่ยวชาญด้าน test strategy, automation, และ quality culture คุณมีจุดยืนว่า **bug ที่พบหลัง deploy มีต้นทุนสูงกว่า bug ที่พบใน development 10 เท่า** คุณมักโต้แย้งทีมที่มองว่า testing เป็น overhead และชี้ให้เห็น edge case ที่นักพัฒนามักมองข้าม คุณเชื่อว่า "ถ้า dev ต้องรอ QA เพื่อหา bug แสดงว่า process พัง" และจะท้าทายทุก feature ที่ไม่มี acceptance criteria ชัดเจน`,
  },
  {
    category: "it",
    emoji: "📦",
    role: "Product Manager",
    name: "Product Manager",
    skills: ["market_research", "data_analysis", "ux_review"],
    soul: `คุณคือ Product Manager ที่เชี่ยวชาญด้าน product strategy, user research, และ roadmap prioritization คุณมีจุดยืนว่า **feature ที่ไม่แก้ user problem จริงๆ คือ technical debt ที่ซ่อนอยู่** คุณมักโต้แย้งการ build feature ตาม request โดยไม่ตั้งคำถามว่า "ทำไม" คุณเชื่อว่าการ say no คือทักษะที่สำคัญที่สุดของ PM และจะท้าทายทุก backlog item ที่ไม่มี user story และ success metric ชัดเจน`,
  },

  // ── Research & Analysis ───────────────────────────────────────────────────
  {
    category: "research",
    emoji: "🔍",
    role: "Academic Researcher",
    name: "Researcher",
    skills: ["web_search", "data_analysis", "summarization"],
    soul: `คุณคือนักวิจัยเชิงวิชาการที่มีจุดยืนชัดเจนว่า **หลักฐานและข้อเท็จจริงต้องมาก่อนเสมอ** คุณไม่เชื่อข้อสรุปใดๆ จนกว่าจะมีหลักฐานเชิงประจักษ์รองรับ และพร้อมโต้แย้งทุกความเห็นที่ขาดหลักฐาน คุณมีนิสัยตั้งคำถามกับสมมติฐานยอดนิยม และมักพบว่าความจริงซับซ้อนกว่าที่คนส่วนใหญ่คิด เมื่อถกเถียง คุณจะยืนหยัดในจุดยืนที่มีหลักฐานสนับสนุน และโจมตีข้อสรุปที่ไม่มีข้อมูลอ้างอิง`,
  },
  {
    category: "research",
    emoji: "🎯",
    role: "Devil's Advocate",
    name: "Devil's Advocate",
    skills: ["risk_assessment", "legal_research", "market_research"],
    soul: `คุณคือ Devil's Advocate ที่มีหน้าที่ **โต้แย้งทุกข้อสรุปที่เป็น consensus** คุณเชื่อว่าเมื่อทุกคนเห็นด้วยกัน นั่นคือสัญญาณเตือนว่ามีอะไรบางอย่างถูกมองข้าม คุณไม่ได้โต้แย้งเพื่อความขัดแย้ง แต่เพราะเชื่อว่า idea ที่ดีจริงจะยิ่งแข็งแกร่งขึ้นหลังผ่านการท้าทายอย่างหนัก เมื่อถกเถียง คุณจะหา assumption ที่ซ่อนอยู่ ชี้ให้เห็น second-order effect และถามว่า "อะไรจะเกิดขึ้นถ้าเราผิดทั้งหมด?"`,
  },
  {
    category: "research",
    emoji: "📈",
    role: "Market Analyst",
    name: "Market Analyst",
    skills: ["market_research", "data_analysis", "web_search", "financial_modeling"],
    soul: `คุณคือ Market Analyst ที่เชี่ยวชาญด้านการวิเคราะห์ตลาด, competitive intelligence, และ industry trends คุณมีจุดยืนว่า **ตลาดเปลี่ยนเร็วกว่าที่องค์กรส่วนใหญ่ปรับตัวได้** คุณมักโต้แย้งคนที่มองแค่ competitor ปัจจุบันโดยไม่เห็น disruptor ที่กำลังจะมา คุณเชื่อว่า market share เป็นแค่ lagging indicator และจะท้าทายทุก market sizing ที่ไม่ระบุ assumption ชัดเจน`,
  },
  {
    category: "research",
    emoji: "⚠️",
    role: "Risk Assessor",
    name: "Risk Assessor",
    skills: ["risk_assessment", "financial_modeling", "legal_research"],
    soul: `คุณคือผู้เชี่ยวชาญด้านการประเมินความเสี่ยงที่เชื่อว่า **ระบบที่ซับซ้อนมักพังในทางที่คาดไม่ถึง** คุณมีจุดยืนว่า optimism bias ทำให้มนุษย์ตัดสินใจผิดพลาดซ้ำแล้วซ้ำเล่า และคุณมีหน้าที่ชี้ให้เห็น worst case scenario ที่คนอื่นไม่กล้าพูดถึง คุณจะ map ทุก risk — operational, financial, legal, reputational — และท้าทายทุกคนที่บอกว่า "มันไม่น่าจะเกิดขึ้น"`,
  },

  // ── General ────────────────────────────────────────────────────────────────
  {
    category: "general",
    emoji: "📊",
    role: "Data Analyst",
    name: "Data Analyst",
    skills: ["data_analysis", "database", "summarization"],
    soul: `คุณคือนักวิเคราะห์ข้อมูลที่เชื่อมั่นใน **ตัวเลขและแนวโน้มมากกว่าความเห็นส่วนตัว** คุณมีจุดยืนว่าการเปลี่ยนแปลงเกิดเร็วกว่าที่คนส่วนใหญ่ประเมิน และมักโต้แย้งคนที่มองโลกในแง่ดีหรือแง่ร้ายเกินไปโดยไม่มีข้อมูลสนับสนุน คุณชอบชี้ให้เห็นว่า correlation ไม่ใช่ causation และจะท้าทายทุก insight ที่ไม่ผ่านการ sanity check ด้วยข้อมูลจากหลายแหล่ง`,
  },
  {
    category: "general",
    emoji: "✍️",
    role: "Synthesizer",
    name: "Synthesizer",
    skills: ["summarization", "translation", "data_analysis"],
    soul: `คุณคือผู้สังเคราะห์ที่เชื่อว่า **ความจริงมักอยู่ตรงกลางระหว่างสองขั้ว** แต่คุณไม่ใช่คนที่เห็นด้วยกับทุกฝ่าย — คุณจะชี้ให้เห็นว่าทั้งสองฝ่ายผิดตรงไหน และเสนอมุมมองที่สาม คุณมีจุดยืนว่าการโต้เถียงแบบ binary (ใช่/ไม่ใช่) มักทำให้มองข้ามประเด็นสำคัญ และคุณจะท้าทายทั้งสองฝ่ายอย่างเท่าเทียม เมื่อถกเถียง คุณจะโจมตีจุดอ่อนของทุกฝ่ายก่อนเสนอทางออกของคุณเอง`,
  },
  {
    category: "general",
    emoji: "🤖",
    role: "Custom",
    name: "",
    skills: [],
    soul: "",
  },
];

const EMPTY_FORM = {
  name: "",
  emoji: "🤖",
  provider: "anthropic" as Provider,
  apiKey: "",
  baseUrl: "",
  model: "",
  soul: "",
  role: "",
  skills: [] as string[],
  useWebSearch: false,
  seniority: 50,
  templateIndex: -1,
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("business");

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  useEffect(() => {
    if (!form.provider) return;
    fetch(`/api/team-models?provider=${form.provider}`)
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models ?? []);
        if (d.models?.length && !editingId) {
          setForm((f) => ({ ...f, model: d.models[0].id }));
        }
      });
  }, [form.provider, editingId]);

  const applyTemplate = (idx: number) => {
    const t = AGENT_TEMPLATES[idx];
    if (!t) return;
    setForm((f) => ({
      ...f,
      templateIndex: idx,
      role: t.role || f.role,
      emoji: t.emoji || f.emoji,
      soul: t.soul || f.soul,
      name: t.name || f.name,
      skills: t.skills,
    }));
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      emoji: agent.emoji,
      provider: agent.provider,
      apiKey: "",
      baseUrl: agent.baseUrl ?? "",
      model: agent.model,
      soul: agent.soul,
      role: agent.role,
      skills: agent.skills ?? [],
      useWebSearch: agent.useWebSearch ?? false,
      seniority: agent.seniority ?? 50,
      templateIndex: -1,
    });
    setEditingId(agent.id);
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.provider || !form.model || !form.soul.trim() || !form.role.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบ: ชื่อ, Provider, Model, Role, Soul");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        emoji: form.emoji,
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl,
        model: form.model,
        soul: form.soul,
        role: form.role,
        skills: form.skills,
        useWebSearch: form.useWebSearch,
        seniority: form.seniority,
      };
      if (editingId) {
        const res = await fetch(`/api/team-agents/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/team-agents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setShowForm(false);
      setEditingId(null);
      fetchAgents();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/team-agents/${id}`, { method: "DELETE" });
    if (res.ok) { setDeleteConfirm(null); fetchAgents(); }
  };

  const handleToggle = async (agent: Agent) => {
    await fetch(`/api/team-agents/${agent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !agent.active }),
    });
    fetchAgents();
  };

  const toggleSkill = (skillId: string) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skillId) ? f.skills.filter((s) => s !== skillId) : [...f.skills, skillId],
    }));
  };

  const categoriesWithTemplates = Object.entries(TEMPLATE_CATEGORIES).map(([key, cat]) => ({
    key,
    ...cat,
    templates: AGENT_TEMPLATES.map((t, i) => ({ ...t, idx: i })).filter((t) => t.category === key),
  }));

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text)", fontFamily: "monospace" }}>
              👥 Team Agents
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              เลือก template สำเร็จรูป — ใส่แค่ API Key ก็พร้อมใช้งาน
            </p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg text-sm font-mono font-bold transition-all"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            + New Agent
          </button>
        </div>

        {/* Agent List */}
        {loading ? (
          <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : agents.length === 0 ? (
          <div className="border rounded-xl p-12 text-center" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <div className="text-4xl mb-3">🤖</div>
            <p className="font-mono">ยังไม่มี agents — กด New Agent เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="border rounded-xl p-5 flex items-start gap-4 transition-all"
                style={{ borderColor: "var(--border)", background: "var(--surface)", opacity: agent.active ? 1 : 0.5 }}
              >
                <div className="text-3xl">{agent.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono" style={{ color: "var(--text)" }}>{agent.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono border ${PROVIDER_COLORS[agent.provider]}`}>
                      {PROVIDER_LABELS[agent.provider]}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      {agent.role}
                    </span>
                    {!agent.hasApiKey && agent.provider !== "ollama" && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30">
                        ⚠ No API Key
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>{agent.model}</div>
                  {agent.skills && agent.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.skills.map((s) => {
                        const skill = ALL_SKILLS.find((sk) => sk.id === s);
                        return skill ? (
                          <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                            {skill.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="text-xs mt-2 line-clamp-2" style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {agent.soul}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(agent)}
                    className="px-3 py-1 rounded text-xs font-mono border transition-all"
                    style={{ borderColor: "var(--border)", color: agent.active ? "var(--accent)" : "var(--text-muted)" }}
                  >
                    {agent.active ? "● On" : "○ Off"}
                  </button>
                  <button
                    onClick={() => openEdit(agent)}
                    className="px-3 py-1 rounded text-xs font-mono border transition-all"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    Edit
                  </button>
                  {deleteConfirm === agent.id ? (
                    <>
                      <button onClick={() => handleDelete(agent.id)} className="px-3 py-1 rounded text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30">Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 rounded text-xs font-mono border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(agent.id)} className="px-3 py-1 rounded text-xs font-mono border border-red-500/30 text-red-400">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Form ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-3xl rounded-2xl border p-6 max-h-[92vh] overflow-y-auto" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold font-mono text-lg" style={{ color: "var(--text)" }}>
                {editingId ? "✏️ Edit Agent" : "✨ New Agent"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono">{error}</div>
            )}

            {/* ── Template Picker ── */}
            <div className="mb-6">
              <div className="text-xs font-mono mb-3 font-bold" style={{ color: "var(--text-muted)" }}>
                เลือก Template สำเร็จรูป
              </div>

              {/* Category tabs */}
              <div className="flex gap-2 mb-3 flex-wrap">
                {categoriesWithTemplates.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all`}
                    style={{
                      borderColor: activeCategory === cat.key ? "var(--accent)" : "var(--border)",
                      color: activeCategory === cat.key ? "var(--accent)" : "var(--text-muted)",
                      background: activeCategory === cat.key ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Templates in active category */}
              <div className="grid grid-cols-2 gap-2">
                {categoriesWithTemplates
                  .find((c) => c.key === activeCategory)
                  ?.templates.map((t) => (
                    <button
                      key={t.idx}
                      onClick={() => applyTemplate(t.idx)}
                      className="text-left p-3 rounded-xl border transition-all"
                      style={{
                        borderColor: form.templateIndex === t.idx ? "var(--accent)" : "var(--border)",
                        background: form.templateIndex === t.idx ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "color-mix(in srgb, var(--bg) 50%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{t.emoji}</span>
                        <div>
                          <div className="text-xs font-mono font-bold" style={{ color: "var(--text)" }}>{t.role}</div>
                          {t.skills.length > 0 && (
                            <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                              {t.skills.slice(0, 3).map((s) => ALL_SKILLS.find((sk) => sk.id === s)?.label.split(" ")[0]).join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                      {t.soul && (
                        <div className="text-[10px] font-mono line-clamp-2 mt-1" style={{ color: "var(--text-muted)" }}>
                          {t.soul.slice(0, 80)}...
                        </div>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            <div className="space-y-4">
              {/* Name + Emoji + Role */}
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>Emoji</label>
                  <input
                    value={form.emoji}
                    onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-center text-xl font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                    maxLength={2}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="เช่น CEO Advisor"
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>Role *</label>
                  <input
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="เช่น CEO / Strategic Advisor"
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>Provider *</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider, model: "" }))}
                  className="w-full px-3 py-2 rounded-lg border font-mono"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* API Key — highlight */}
              <div className="p-4 rounded-xl border-2" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
                <label className="text-xs font-mono mb-1 block font-bold" style={{ color: "var(--accent)" }}>
                  🔑 API Key {editingId ? "(เว้นว่างถ้าไม่ต้องการเปลี่ยน)" : "— ใส่แค่นี้เพียงอย่างเดียว!"}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder={editingId ? "••••••• (เว้นว่างถ้าไม่เปลี่ยน)" : "sk-ant-xxx / sk-xxx / AIzaSy..."}
                  className="w-full px-3 py-2 rounded-lg border font-mono"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              {/* Base URL */}
              {(form.provider === "ollama" || form.provider === "custom") && (
                <div>
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                    Base URL {form.provider === "ollama" ? "(default: http://localhost:11434)" : "(OpenAI-compatible endpoint)"}
                  </label>
                  <input
                    value={form.baseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder={form.provider === "ollama" ? "http://localhost:11434" : "https://your-api.com/v1"}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              )}

              {/* Model */}
              <div>
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>Model *</label>
                {models.length > 0 ? (
                  <select
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <option value="">เลือก model...</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({(m.contextWindow / 1000).toFixed(0)}K ctx)</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="ชื่อ model เช่น llama3.2, custom-model"
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                )}
              </div>

              {/* Skills */}
              <div>
                <label className="text-xs font-mono mb-2 block font-bold" style={{ color: "var(--text-muted)" }}>
                  Skills / ความสามารถพิเศษ
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_SKILLS.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className="flex items-start gap-2 p-2 rounded-lg border text-left transition-all"
                      style={{
                        borderColor: form.skills.includes(skill.id) ? "var(--accent)" : "var(--border)",
                        background: form.skills.includes(skill.id) ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                      }}
                    >
                      <span className="text-xs font-mono font-bold" style={{ color: form.skills.includes(skill.id) ? "var(--accent)" : "var(--text)" }}>
                        {skill.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Web Search + Seniority */}
              <div className="flex gap-3">
                <div className="flex-1 p-3 rounded-lg border flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <div>
                    <div className="text-xs font-mono font-bold" style={{ color: "var(--text)" }}>🔍 Web Search</div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>ค้นหาข้อมูลจากอินเทอร์เน็ต</div>
                  </div>
                  <button
                    type="button"
                    title={form.useWebSearch ? "ปิด Web Search" : "เปิด Web Search"}
                    aria-label={form.useWebSearch ? "ปิด Web Search" : "เปิด Web Search"}
                    onClick={() => setForm((f) => ({ ...f, useWebSearch: !f.useWebSearch }))}
                    className="w-10 h-5 rounded-full transition-all relative"
                    style={{ background: form.useWebSearch ? "var(--accent)" : "var(--border)" }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: form.useWebSearch ? "calc(100% - 18px)" : "2px" }}
                    />
                  </button>
                </div>
                <div className="flex-1 p-3 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <label className="text-xs font-mono font-bold block mb-1" style={{ color: "var(--text)" }}>
                    🏛️ Seniority (ลำดับพูด)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={99}
                      value={form.seniority}
                      aria-label="ลำดับ Seniority"
                      title="ลำดับ Seniority — 1 = ประธาน, 99 = พูดท้าย"
                      onChange={(e) => setForm((f) => ({ ...f, seniority: Number(e.target.value) }))}
                      className="flex-1"
                    />
                    <span className="text-xs font-mono w-8 text-center" style={{ color: "var(--accent)" }}>{form.seniority}</span>
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>1 = ประธาน, 99 = พูดท้าย</div>
                </div>
              </div>

              {/* Soul */}
              <div>
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Soul (System Prompt) * — บุคลิกและบทบาทของ agent
                </label>
                <textarea
                  value={form.soul}
                  onChange={(e) => setForm((f) => ({ ...f, soul: e.target.value }))}
                  rows={5}
                  placeholder="อธิบายบุคลิก ความเชี่ยวชาญ และวิธีการทำงานของ agent นี้..."
                  className="w-full px-3 py-2 rounded-lg border font-mono text-sm resize-none"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{form.soul.length} ตัวอักษร</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm font-mono border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 rounded-lg text-sm font-mono font-bold disabled:opacity-50 transition-all"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {saving ? "Saving..." : editingId ? "Update Agent" : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
