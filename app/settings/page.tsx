"use client";

import { useEffect, useState, useCallback } from "react";

interface SettingsState {
  hasSerperKey: boolean;
  hasSerpApiKey: boolean;
  serperKeyPreview: string | null;
  serpApiKeyPreview: string | null;
  updatedAt: string | null;
}

export default function SettingsPage() {
  const [state, setState] = useState<SettingsState>({
    hasSerperKey: false,
    hasSerpApiKey: false,
    serperKeyPreview: null,
    serpApiKeyPreview: null,
    updatedAt: null,
  });
  const [serperKey, setSerperKey] = useState("");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/team-settings");
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string> = {};
    if (serperKey) body.serperApiKey = serperKey;
    if (serpApiKey) body.serpApiKey = serpApiKey;

    const res = await fetch("/api/team-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setSerperKey("");
      setSerpApiKey("");
      await loadSettings();
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleClear = async (which: "serper" | "serpapi") => {
    await fetch("/api/team-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(which === "serper" ? { serperApiKey: "" } : { serpApiKey: "" }),
    });
    await loadSettings();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/team-websearch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "test search openclaw" }),
      });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setTestResult({ ok: true, message: `✅ ค้นหาสำเร็จ! ได้ ${data.results.length} ผลลัพธ์ (ใช้ ${data.source})` });
      } else {
        setTestResult({ ok: false, message: `⚠️ ${data.error ?? "ไม่พบผลลัพธ์ — ตรวจสอบ API key"}` });
      }
    } catch {
      setTestResult({ ok: false, message: "❌ เกิดข้อผิดพลาด ไม่สามารถเชื่อมต่อได้" });
    }
    setTesting(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--accent)" }}>⚙️ Settings</h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>ตั้งค่า API Keys สำหรับฟีเจอร์ต่างๆ</p>

      {/* Web Search Section */}
      <div className="rounded-xl border p-6 mb-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔍</span>
          <h2 className="text-base font-semibold">Web Search API Keys</h2>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          ใช้ค้นหาข้อมูลจากอินเทอร์เน็ตประกอบการวิเคราะห์ของ Agents ที่เปิดใช้งาน Web Search
        </p>

        {/* Serper */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">
              Serper API Key
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>Primary</span>
            </label>
            {state.hasSerperKey && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{state.serperKeyPreview}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #22c55e 15%, transparent)", color: "#22c55e" }}>✓ บันทึกแล้ว</span>
                <button onClick={() => handleClear("serper")} className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>ลบ</button>
              </div>
            )}
          </div>
          <input
            type="password"
            placeholder={state.hasSerperKey ? "ใส่ key ใหม่เพื่อเปลี่ยน..." : "f5e5101f..."}
            value={serperKey}
            onChange={(e) => setSerperKey(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            2,500 queries/month ฟรี — <span style={{ color: "var(--accent)" }}>serper.dev</span>
          </p>
        </div>

        {/* SerpApi */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">
              SerpApi API Key
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--text-muted) 15%, transparent)", color: "var(--text-muted)" }}>Fallback</span>
            </label>
            {state.hasSerpApiKey && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{state.serpApiKeyPreview}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #22c55e 15%, transparent)", color: "#22c55e" }}>✓ บันทึกแล้ว</span>
                <button onClick={() => handleClear("serpapi")} className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>ลบ</button>
              </div>
            )}
          </div>
          <input
            type="password"
            placeholder={state.hasSerpApiKey ? "ใส่ key ใหม่เพื่อเปลี่ยน..." : "1e677b3f..."}
            value={serpApiKey}
            onChange={(e) => setSerpApiKey(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            100 queries/month ฟรี — <span style={{ color: "var(--accent)" }}>serpapi.com</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || (!serperKey && !serpApiKey)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--accent)",
              color: "white",
              opacity: saving || (!serperKey && !serpApiKey) ? 0.5 : 1,
              cursor: saving || (!serperKey && !serpApiKey) ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
          </button>

          <button
            onClick={handleTest}
            disabled={testing || (!state.hasSerperKey && !state.hasSerpApiKey)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              opacity: testing || (!state.hasSerperKey && !state.hasSerpApiKey) ? 0.5 : 1,
              cursor: testing || (!state.hasSerperKey && !state.hasSerpApiKey) ? "not-allowed" : "pointer",
            }}
          >
            {testing ? "กำลังทดสอบ..." : "🧪 ทดสอบ"}
          </button>

          {saved && <span className="text-sm" style={{ color: "#22c55e" }}>✅ บันทึกสำเร็จ!</span>}
        </div>

        {testResult && (
          <div className="mt-3 text-sm px-3 py-2 rounded-lg" style={{
            background: testResult.ok ? "color-mix(in srgb, #22c55e 10%, transparent)" : "color-mix(in srgb, #ef4444 10%, transparent)",
            border: `1px solid ${testResult.ok ? "#22c55e44" : "#ef444444"}`,
            color: testResult.ok ? "#22c55e" : "#ef4444",
          }}>
            {testResult.message}
          </div>
        )}

        {state.updatedAt && (
          <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
            อัปเดตล่าสุด: {new Date(state.updatedAt).toLocaleString("th-TH")}
          </p>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3">📋 วิธีใช้งาน Web Search</h3>
        <ol className="text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
          <li>1. บันทึก API Key อย่างน้อย 1 อัน (Serper แนะนำ)</li>
          <li>2. ไปที่ <span style={{ color: "var(--accent)" }}>/agents</span> → แก้ไข Agent → เปิด <strong>Web Search</strong></li>
          <li>3. ใน Research หรือ Meeting Room — Agent ที่เปิด Web Search จะค้นหาข้อมูลก่อนตอบ</li>
        </ol>
      </div>
    </div>
  );
}
