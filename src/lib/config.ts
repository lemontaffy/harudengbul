import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  apiKeySource: "db" | "env" | "none";
  modelSource: "db" | "env" | "none";
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

// 우선순위: DB(settings, GUI에서 편집) > env(부트스트랩 기본값).
// 코드에 모델명 하드코딩 금지 — 항상 이 함수로만 읽는다.
export async function getOpenRouterConfig(): Promise<OpenRouterConfig> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.id, 1),
  });

  const dbKey = row?.openrouterApiKey?.trim() || "";
  const dbModel = row?.openrouterModel?.trim() || "";
  const envKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  const envModel = process.env.OPENROUTER_MODEL?.trim() || "";

  return {
    apiKey: dbKey || envKey,
    model: dbModel || envModel,
    baseUrl: row?.openrouterBaseUrl?.trim() || DEFAULT_BASE_URL,
    apiKeySource: dbKey ? "db" : envKey ? "env" : "none",
    modelSource: dbModel ? "db" : envModel ? "env" : "none",
  };
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return "••••" + key.slice(-4);
}
