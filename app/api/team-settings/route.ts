import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/agents-store";

export async function GET() {
  const settings = getSettings();
  // Return masked keys (show only last 6 chars)
  return NextResponse.json({
    hasSerperKey: !!settings.serperApiKey,
    hasSerpApiKey: !!settings.serpApiKey,
    serperKeyPreview: settings.serperApiKey ? `...${settings.serperApiKey.slice(-6)}` : null,
    serpApiKeyPreview: settings.serpApiKey ? `...${settings.serpApiKey.slice(-6)}` : null,
    updatedAt: settings.updatedAt,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { serperApiKey, serpApiKey } = body as { serperApiKey?: string; serpApiKey?: string };
  const result = saveSettings({ serperApiKey, serpApiKey });
  return NextResponse.json({
    hasSerperKey: !!result.serperApiKey,
    hasSerpApiKey: !!result.serpApiKey,
    updatedAt: result.updatedAt,
  });
}
