import * as appConfigRepo from "@/db/repo/appConfig";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  apiKeySource: "db" | "env" | "none";
  modelSource: "db" | "env" | "none";
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

// 전역(운영자 관리) OpenRouter 연결. 우선순위: app_config(DB) > env.
// 멤버는 이 전역 설정을 공유한다(크레딧 보호는 daily_message_limit + usage_log).
// 코드에 모델명 하드코딩 금지 — 항상 이 함수로만 읽는다.
export async function getOpenRouterConfig(): Promise<OpenRouterConfig> {
  const row = await appConfigRepo.get();

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
