import { NextRequest, NextResponse } from "next/server";
import { AgentProvider } from "@/lib/agents-store";

const PROVIDER_MODELS: Record<AgentProvider, { id: string; name: string; contextWindow: number }[]> = {
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 200000 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000 },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: 200000 },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000 },
    { id: "o1", name: "o1", contextWindow: 200000 },
    { id: "o3-mini", name: "o3-mini", contextWindow: 200000 },
  ],
  gemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1000000 },
    { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro", contextWindow: 1000000 },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 1000000 },
  ],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000 },
    { id: "mistral", name: "Mistral", contextWindow: 32000 },
    { id: "qwen2.5", name: "Qwen 2.5", contextWindow: 128000 },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200000 },
    { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000 },
    { id: "openai/gpt-4o", name: "GPT-4o", contextWindow: 128000 },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000 },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", contextWindow: 1000000 },
    { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash", contextWindow: 1000000 },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128000 },
    { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", contextWindow: 128000 },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", contextWindow: 64000 },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", contextWindow: 64000 },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", contextWindow: 128000 },
    { id: "mistralai/mistral-large", name: "Mistral Large", contextWindow: 128000 },
  ],
  custom: [
    { id: "custom-model", name: "Custom Model", contextWindow: 128000 },
  ],
};

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") as AgentProvider | null;
  if (!provider || !PROVIDER_MODELS[provider]) {
    return NextResponse.json({ models: [] });
  }
  return NextResponse.json({ models: PROVIDER_MODELS[provider] });
}
