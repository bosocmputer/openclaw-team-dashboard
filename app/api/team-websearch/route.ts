import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/agents-store";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function POST(req: NextRequest) {
  const { query } = await req.json() as { query: string };
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  const settings = getSettings();

  // Try Serper first
  if (settings.serperApiKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": settings.serperApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const results: WebSearchResult[] = (data.organic ?? []).slice(0, 5).map((r: { title: string; link: string; snippet: string }) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet ?? "",
        }));
        return NextResponse.json({ results, source: "serper" });
      }
    } catch {
      // fall through to SerpApi
    }
  }

  // Fallback: SerpApi
  if (settings.serpApiKey) {
    try {
      const params = new URLSearchParams({
        q: query,
        api_key: settings.serpApiKey,
        engine: "google",
        num: "5",
      });
      const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const results: WebSearchResult[] = (data.organic_results ?? []).slice(0, 5).map((r: { title: string; link: string; snippet: string }) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet ?? "",
        }));
        return NextResponse.json({ results, source: "serpapi" });
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ results: [], source: "none", error: "No search API key configured or all providers failed" });
}
