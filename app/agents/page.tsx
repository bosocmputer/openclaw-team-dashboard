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

const SOUL_TEMPLATES: Record<string, { role: string; soul: string; emoji: string }> = {
  researcher: {
    role: "Researcher",
    emoji: "🔍",
    soul: "คุณคือนักวิจัยผู้เชี่ยวชาญที่มีจุดยืนชัดเจนว่า **หลักฐานและข้อเท็จจริงต้องมาก่อนเสมอ** คุณไม่เชื่อข้อสรุปใดๆ จนกว่าจะมีหลักฐานเชิงประจักษ์รองรับ และพร้อมโต้แย้งทุกความเห็นที่ขาดหลักฐาน คุณมีนิสัยตั้งคำถามกับสมมติฐานยอดนิยม และมักพบว่าความจริงซับซ้อนกว่าที่คนส่วนใหญ่คิด เมื่อถกเถียง คุณจะยืนหยัดในจุดยืนที่มีหลักฐานสนับสนุน และโจมตีข้อสรุปที่ไม่มีข้อมูลอ้างอิง",
  },
  analyst: {
    role: "Analyst",
    emoji: "📊",
    soul: "คุณคือนักวิเคราะห์ที่เชื่อมั่นใน **ตัวเลขและแนวโน้มมากกว่าความเห็นส่วนตัว** คุณมีจุดยืนว่าการเปลี่ยนแปลงเกิดเร็วกว่าที่คนส่วนใหญ่ประเมิน และมักโต้แย้งคนที่มองโลกในแง่ดีหรือแง่ร้ายเกินไปโดยไม่มีข้อมูลสนับสนุน คุณชอบชี้ให้เห็นว่า trend ที่คนมองข้ามคืออะไร และไม่กลัวที่จะพูดความจริงที่ไม่เป็นที่นิยม เมื่อถกเถียง คุณจะใช้ข้อมูลเชิงสถิติและแนวโน้มเป็นอาวุธหลัก",
  },
  synthesizer: {
    role: "Synthesizer",
    emoji: "✍️",
    soul: "คุณคือผู้สังเคราะห์ที่เชื่อว่า **ความจริงมักอยู่ตรงกลางระหว่างสองขั้ว** แต่คุณไม่ใช่คนที่เห็นด้วยกับทุกฝ่าย — คุณจะชี้ให้เห็นว่าทั้งสองฝ่ายผิดตรงไหน และเสนอมุมมองที่สาม คุณมีจุดยืนว่าการโต้เถียงแบบ binary (ใช่/ไม่ใช่) มักทำให้มองข้ามประเด็นสำคัญ และคุณจะท้าทายทั้งสองฝ่ายอย่างเท่าเทียม เมื่อถกเถียง คุณจะโจมตีจุดอ่อนของทุกฝ่ายก่อนเสนอทางออกของคุณเอง",
  },
  critic: {
    role: "Critic",
    emoji: "🎯",
    soul: "คุณคือนักวิจารณ์ที่มีจุดยืนว่า **คนส่วนใหญ่ประเมินความเสี่ยงต่ำเกินไปและมองโลกในแง่ดีเกินจริง** คุณมีหน้าที่หาข้อบกพร่อง ความเสี่ยงซ่อนเร้น และสมมติฐานที่ผิดพลาดในทุกข้อเสนอ คุณไม่เชื่อ consensus และมักพบว่าสิ่งที่ทุกคนเห็นด้วยคือสัญญาณเตือนว่ามีอะไรบางอย่างถูกมองข้าม เมื่อถกเถียง คุณจะโจมตีทุกจุดที่ไม่มีการพิสูจน์ความเสี่ยง และยืนหยัดแม้จะเป็นเสียงส่วนน้อย",
  },
  optimist: {
    role: "Optimist",
    emoji: "🚀",
    soul: "คุณคือนักมองอนาคตที่เชื่อมั่นว่า **เทคโนโลยีและนวัตกรรมจะแก้ปัญหาได้เสมอ** คุณมีจุดยืนชัดเจนว่ามนุษย์ประเมินศักยภาพของความก้าวหน้าต่ำเกินไป และมักโต้แย้งคนที่มองโลกในแง่ร้ายหรือกลัวการเปลี่ยนแปลง คุณชอบยกตัวอย่างกรณีที่คำทำนายหายนะไม่เป็นจริง และเชื่อว่าโอกาสมักซ่อนอยู่ในความเปลี่ยนแปลงที่น่ากลัว เมื่อถกเถียง คุณจะโต้แย้งความกลัวด้วยหลักฐานที่แสดงถึงความก้าวหน้า",
  },
  pessimist: {
    role: "Pessimist",
    emoji: "⚠️",
    soul: "คุณคือนักวิเคราะห์ความเสี่ยงที่เชื่อว่า **ระบบที่ซับซ้อนมักพังในทางที่คาดไม่ถึง** คุณมีจุดยืนว่า optimism bias ทำให้มนุษย์ตัดสินใจผิดพลาดซ้ำแล้วซ้ำเล่า และคุณมีหน้าที่ชี้ให้เห็น worst case scenario ที่คนอื่นไม่กล้าพูดถึง คุณไม่ได้มองโลกในแง่ร้ายเพื่อความสนุก แต่เพราะเชื่อว่าการเตรียมรับมือกับสิ่งเลวร้ายดีกว่าถูกจับไม่ทัน เมื่อถกเถียง คุณจะโจมตีทุก assumption ที่มองข้ามความเสี่ยง",
  },
  custom: {
    role: "",
    emoji: "🤖",
    soul: "",
  },
};

const EMPTY_FORM = {
  name: "",
  emoji: "🤖",
  provider: "anthropic" as Provider,
  apiKey: "",
  baseUrl: "",
  model: "",
  soul: "",
  role: "",
  template: "custom",
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

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/team-agents");
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

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

  const applyTemplate = (key: string) => {
    const t = SOUL_TEMPLATES[key];
    if (!t) return;
    setForm((f) => ({
      ...f,
      template: key,
      role: t.role || f.role,
      emoji: t.emoji || f.emoji,
      soul: t.soul || f.soul,
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
      template: "custom",
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
      if (editingId) {
        const res = await fetch(`/api/team-agents/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            emoji: form.emoji,
            provider: form.provider,
            apiKey: form.apiKey,
            baseUrl: form.baseUrl,
            model: form.model,
            soul: form.soul,
            role: form.role,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/team-agents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            emoji: form.emoji,
            provider: form.provider,
            apiKey: form.apiKey,
            baseUrl: form.baseUrl,
            model: form.model,
            soul: form.soul,
            role: form.role,
          }),
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
    if (res.ok) {
      setDeleteConfirm(null);
      fetchAgents();
    }
  };

  const handleToggle = async (agent: Agent) => {
    await fetch(`/api/team-agents/${agent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !agent.active }),
    });
    fetchAgents();
  };

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
              จัดการ agents ในทีม — เพิ่ม แก้ไข ลบ และตั้งค่า soul
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
          <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : agents.length === 0 ? (
          <div
            className="border rounded-xl p-12 text-center"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <div className="text-4xl mb-3">🤖</div>
            <p className="font-mono">ยังไม่มี agents — กด New Agent เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="border rounded-xl p-5 flex items-start gap-4 transition-all"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  opacity: agent.active ? 1 : 0.5,
                }}
              >
                <div className="text-3xl">{agent.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono" style={{ color: "var(--text)" }}>
                      {agent.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono border ${PROVIDER_COLORS[agent.provider]}`}
                    >
                      {PROVIDER_LABELS[agent.provider]}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-mono border"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      {agent.role}
                    </span>
                    {!agent.hasApiKey && agent.provider !== "ollama" && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30">
                        ⚠ No API Key
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
                    {agent.model}
                  </div>
                  <div
                    className="text-xs mt-2 line-clamp-2"
                    style={{ color: "var(--text-muted)", fontFamily: "monospace" }}
                  >
                    {agent.soul}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(agent)}
                    className="px-3 py-1 rounded text-xs font-mono border transition-all"
                    style={{
                      borderColor: "var(--border)",
                      color: agent.active ? "var(--accent)" : "var(--text-muted)",
                    }}
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
                      <button
                        onClick={() => handleDelete(agent.id)}
                        className="px-3 py-1 rounded text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1 rounded text-xs font-mono border"
                        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(agent.id)}
                      className="px-3 py-1 rounded text-xs font-mono border border-red-500/30 text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div
            className="w-full max-w-2xl rounded-2xl border p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold font-mono text-lg" style={{ color: "var(--text)" }}>
                {editingId ? "✏️ Edit Agent" : "✨ New Agent"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: "var(--text-muted)" }}>
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono">
                {error}
              </div>
            )}

            {/* Template Picker */}
            <div className="mb-5">
              <label className="text-xs font-mono mb-2 block" style={{ color: "var(--text-muted)" }}>
                Soul Template (เลือกเพื่อโหลด soul สำเร็จรูป)
              </label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(SOUL_TEMPLATES).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => applyTemplate(key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all"
                    style={{
                      borderColor: form.template === key ? "var(--accent)" : "var(--border)",
                      color: form.template === key ? "var(--accent)" : "var(--text-muted)",
                      background: form.template === key ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                    }}
                  >
                    {t.emoji || "🤖"} {key === "custom" ? "Custom" : t.role}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {/* Name + Emoji */}
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                    Emoji
                  </label>
                  <input
                    value={form.emoji}
                    onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-center text-xl font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                    maxLength={2}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                    Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="เช่น นักวิจัยอาวุโส"
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                    Role *
                  </label>
                  <input
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="เช่น Researcher"
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Provider *
                </label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider, model: "" }))}
                  className="w-full px-3 py-2 rounded-lg border font-mono"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                  API Key {editingId ? "(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)" : "*"}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder={editingId ? "••••••••• (เว้นว่างถ้าไม่เปลี่ยน)" : "sk-ant-xxx / sk-xxx / AIzaSy..."}
                  className="w-full px-3 py-2 rounded-lg border font-mono"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              {/* Base URL (for ollama/custom) */}
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
                <label className="text-xs font-mono mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Model *
                </label>
                {models.length > 0 ? (
                  <select
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <option value="">เลือก model...</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({(m.contextWindow / 1000).toFixed(0)}K ctx)
                      </option>
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
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {form.soul.length} ตัวอักษร
                </div>
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
