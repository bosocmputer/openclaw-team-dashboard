import { NextResponse } from "next/server";
import { listTeams, createTeam } from "@/lib/agents-store";

export async function GET() {
  try {
    const teams = listTeams();
    return NextResponse.json({ teams });
  } catch (e) {
    console.error("GET /api/teams error", e);
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, emoji, description, agentIds } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const team = createTeam({
      name: String(name).trim(),
      emoji: typeof emoji === "string" ? emoji.trim() || "👥" : "👥",
      description: typeof description === "string" ? description.trim() : "",
      agentIds: Array.isArray(agentIds) ? agentIds.filter((id) => typeof id === "string") : [],
    });
    return NextResponse.json({ team }, { status: 201 });
  } catch (e) {
    console.error("POST /api/teams error", e);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
