import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  const mode = searchParams.get("mode") ?? "general";

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  // Normalize: strip trailing slash and known MCP paths so user can paste any form
  const base = endpoint.replace(/\/(health|tools|call|mcp|sse)\/?$/, "").replace(/\/$/, "");

  try {
    // Test health endpoint
    const healthRes = await fetch(`${base}/health`, {
      headers: { "mcp-access-mode": mode },
      signal: AbortSignal.timeout(6000),
    });

    if (!healthRes.ok) {
      return NextResponse.json({ ok: false, error: `Health check failed: ${healthRes.status}` });
    }

    // Get available tools
    let toolCount = 0;
    try {
      const toolsRes = await fetch(`${base}/tools`, {
        headers: { "mcp-access-mode": mode },
        signal: AbortSignal.timeout(6000),
      });
      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        const tools = toolsData.tools ?? toolsData ?? [];
        toolCount = Array.isArray(tools) ? tools.length : 0;
      }
    } catch { /* ignore tools error, health already passed */ }

    return NextResponse.json({ ok: true, toolCount });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
