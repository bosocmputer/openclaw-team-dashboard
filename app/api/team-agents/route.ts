import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent, AgentProvider } from "@/lib/agents-store";

export async function GET() {
  try {
    const agents = listAgents();
    return NextResponse.json({ agents });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, emoji, provider, apiKey, baseUrl, model, soul, role, useWebSearch, seniority, mcpEndpoint, mcpAccessMode } = body;

    if (!name || !provider || !model || !soul || !role) {
      return NextResponse.json({ error: "Missing required fields: name, provider, model, soul, role" }, { status: 400 });
    }

    const agent = createAgent({
      name,
      emoji: emoji || "🤖",
      provider: provider as AgentProvider,
      apiKey: apiKey || "",
      baseUrl,
      model,
      soul,
      role,
      useWebSearch: useWebSearch ?? false,
      seniority,
      mcpEndpoint,
      mcpAccessMode,
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
