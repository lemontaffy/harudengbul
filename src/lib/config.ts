import * as settingsRepo from "@/db/repo/settings";
import { decryptSecret } from "@/lib/crypto";

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean; // 키+baseUrl+모델 모두 있어야 채팅 가능
}

// 사용자별 OpenAI 호환 LLM 연결. 전역/env 폴백 없음 — 각자 자기 키.
// 코드에 모델명/공급사 하드코딩 금지 — 항상 이 함수로만 읽는다.
// 키는 DB에 암호화 저장 → 여기서 복호화(레거시 평문은 그대로 통과).
export async function getLlmConfig(userId: number): Promise<LlmConfig> {
  const s = await settingsRepo.getByUser(userId);
  let apiKey = "";
  try {
    apiKey = decryptSecret(s?.llmApiKey).trim();
  } catch (err) {
    // 키 변경 등으로 복호화 실패 — 미설정으로 취급(채팅 차단), 로그만.
    console.error("[config] llm key 복호화 실패:", err);
  }
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
