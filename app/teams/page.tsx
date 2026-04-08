"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  active: boolean;
}

interface Team {
  id: string;
  name: string;
  emoji: string;
  description: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = { name: "", emoji: "👥", description: "", agentIds: [] as string[] };

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, ar] = await Promise.all([
        fetch("/api/teams").then((r) => r.json()),
        fetch("/api/team-agents").then((r) => r.json()),
      ]);
      setTeams(tr.teams ?? []);
      setAgents((ar.agents ?? []).filter((a: Agent) => a.active));
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setShowModal(true);
  };

  const openEdit = (team: Team) => {
    setEditTarget(team);
    setForm({ name: team.name, emoji: team.emoji, description: team.description, agentIds: [...team.agentIds] });
    setError("");
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditTarget(null);
  };

  const toggleAgent = (id: string) => {
    setForm((f) => ({
      ...f,
      agentIds: f.agentIds.includes(id) ? f.agentIds.filter((x) => x !== id) : [...f.agentIds, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("กรุณาใส่ชื่อ Team"); return; }
    setSaving(true);
    setError("");
    try {
      const url = editTarget ? `/api/teams/${editTarget.id}` : "/api/teams";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "บันทึกไม่สำเร็จ");
      }
      await fetchAll();
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("ลบไม่สำเร็จ");
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const agentById = (id: string) => agents.find((a) => a.id === id);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-pixel, monospace)", letterSpacing: "0.04em" }}>
            📋 Teams
          </h1>
          <p className="mt-1 text-sm opacity-55">จัดกลุ่ม agents เพื่อใช้งานใน Research ร่วมกัน</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border transition-colors"
          style={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            background: "color-mix(in srgb, var(--accent) 10%, transparent)",
          }}
        >
          <span>+</span>
          <span>สร้าง Team ใหม่</span>
        </button>
      </div>

      {/* Error banner */}
      {error && !showModal && (
        <div className="border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-sm opacity-40">กำลังโหลด…</div>
      )}

      {/* Empty state */}
      {!loading && teams.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 opacity-40">
          <span className="text-4xl">👥</span>
          <p className="text-sm">ยังไม่มี Team — กดปุ่ม &ldquo;สร้าง Team ใหม่&rdquo; เพื่อเริ่มต้น</p>
        </div>
      )}

      {/* Team cards */}
      {!loading && teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex flex-col gap-3 border p-4 transition-colors"
              style={{ borderColor: "var(--border)", background: "var(--card-bg, var(--bg))" }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl flex-shrink-0">{team.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{team.name}</div>
                    {team.description && (
                      <div className="text-xs opacity-50 truncate">{team.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(team)}
                    className="px-2 py-1 text-xs border opacity-60 hover:opacity-100 transition-opacity"
                    style={{ borderColor: "var(--border)" }}
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(team.id)}
                    className="px-2 py-1 text-xs border border-red-500/40 text-red-400 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    ลบ
                  </button>
                </div>
              </div>

              {/* Agent pills */}
              <div className="flex flex-wrap gap-1 min-h-[24px]">
                {team.agentIds.length === 0 && (
                  <span className="text-xs opacity-30">ยังไม่มี agent</span>
                )}
                {team.agentIds.map((aid) => {
                  const a = agentById(aid);
                  return a ? (
                    <span
                      key={aid}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                    >
                      <span>{a.emoji}</span>
                      <span>{a.name}</span>
                    </span>
                  ) : (
                    <span key={aid} className="inline-flex items-center px-2 py-0.5 text-xs opacity-30 border" style={{ borderColor: "var(--border)" }}>
                      {aid.slice(0, 8)}…
                    </span>
                  );
                })}
              </div>

              {/* Link to research */}
              <Link
                href={`/research?teamId=${team.id}`}
                className="mt-auto text-xs text-center py-1.5 border transition-colors"
                style={{
                  borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 7%, transparent)",
                }}
              >
                🔬 Research กับ Team นี้
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm border p-6 flex flex-col gap-4"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          >
            <p className="font-semibold">ยืนยันการลบ Team?</p>
            <p className="text-sm opacity-60">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border"
                style={{ borderColor: "var(--border)" }}
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm border border-red-500/60 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-lg border flex flex-col gap-0 overflow-hidden"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="font-semibold text-sm">{editTarget ? "แก้ไข Team" : "สร้าง Team ใหม่"}</span>
              <button onClick={closeModal} className="opacity-50 hover:opacity-100 text-lg leading-none">✕</button>
            </div>

            {/* Modal body */}
            <div className="flex flex-col gap-4 p-5 overflow-y-auto max-h-[70vh]">
              {error && (
                <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
              )}

              {/* Emoji + Name row */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs opacity-50">Emoji</label>
                  <input
                    type="text"
                    value={form.emoji}
                    onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                    title="Team emoji"
                    placeholder="👥"
                    className="w-14 border px-2 py-1.5 text-center text-lg bg-transparent focus:outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border)" }}
                    maxLength={4}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs opacity-50">ชื่อ Team *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="เช่น Research A-Team"
                    className="border px-3 py-1.5 bg-transparent focus:outline-none focus:border-[var(--accent)] text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs opacity-50">คำอธิบาย (ไม่บังคับ)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="อธิบายวัตถุประสงค์ของ team นี้…"
                  className="border px-3 py-1.5 bg-transparent focus:outline-none focus:border-[var(--accent)] text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>

              {/* Agent selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs opacity-50">เลือก Agents ({form.agentIds.length} เลือก)</label>
                {agents.length === 0 ? (
                  <p className="text-xs opacity-40 py-2">ไม่มี active agent — ไปที่{" "}
                    <Link href="/agents" className="underline" style={{ color: "var(--accent)" }}>Agents</Link>{" "}
                    เพื่อเพิ่ม agent ก่อน
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto border p-2" style={{ borderColor: "var(--border)" }}>
                    {agents.map((agent) => {
                      const selected = form.agentIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleAgent(agent.id)}
                          className="flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors"
                          style={{
                            background: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                            color: selected ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          <span className="w-4 text-center">{selected ? "✓" : ""}</span>
                          <span>{agent.emoji}</span>
                          <span className="font-medium">{agent.name}</span>
                          <span className="text-xs opacity-50 ml-auto">{agent.role}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm border disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm border disabled:opacity-40 transition-colors"
                style={{
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                }}
              >
                {saving ? "กำลังบันทึก…" : editTarget ? "บันทึก" : "สร้าง Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
