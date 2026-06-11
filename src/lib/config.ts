import * as settingsRepo from "@/db/repo/settings";

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean; // 키+baseUrl+모델 모두 있어야 채팅 가능
}

// 사용자별 OpenAI 호환 LLM 연결. 전역/env 폴백 없음 — 각자 자기 키.
// 코드에 모델명/공급사 하드코딩 금지 — 항상 이 함수로만 읽는다.
export async function getLlmConfig(userId: number): Promise<LlmConfig> {
  const s = await settingsRepo.getByUser(userId);
  const apiKey = s?.llmApiKey?.trim() || "";
  const baseUrl = s?.llmBaseUrl?.trim() || "";
  const model = s?.llmModel?.trim() || "";
  return {
    apiKey,
    baseUrl,
    model,
    configured: !!apiKey && !!baseUrl && !!model,
  };
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return "••••" + key.slice(-4);
}
