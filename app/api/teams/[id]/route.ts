import { NextResponse } from "next/server";
import { updateTeam, deleteTeam } from "@/lib/agents-store";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, emoji, description, agentIds } = body;
    const patch: Parameters<typeof updateTeam>[1] = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (emoji !== undefined) patch.emoji = String(emoji).trim() || "👥";
    if (description !== undefined) patch.description = String(description).trim();
    if (Array.isArray(agentIds)) patch.agentIds = agentIds.filter((x) => typeof x === "string");
    const team = updateTeam(id, patch);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    return NextResponse.json({ team });
  } catch (e) {
    console.error("PATCH /api/teams/[id] error", e);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ok = deleteTeam(id);
    if (!ok) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/teams/[id] error", e);
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
