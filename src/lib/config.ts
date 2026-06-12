import * as settingsRepo from "@/db/repo/settings";
import * as connectionsRepo from "@/db/repo/connections";
import type { ConnectionRow } from "@/db/repo/connections";
import { decryptSecret } from "@/lib/crypto";

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean; // 키+baseUrl+모델 모두 있어야 채팅 가능
  supportsVision: boolean; // 이미지 인식 가능 모델(일기 사진을 읽힐지). 레거시 연결은 false.
}

function dec(v: string | null | undefined): string {
  try {
    return decryptSecret(v).trim();
  } catch (err) {
    console.error("[config] llm key 복호화 실패:", err);
    return "";
  }
}

// 메인 연결(settings.active_connection_id) → 없으면 첫 연결 → 없으면 레거시 단일 컬럼.
async function activeConnection(userId: number): Promise<{
  conn: ConnectionRow | undefined;
  legacy: Awaited<ReturnType<typeof settingsRepo.getByUser>>;
}> {
  const s = await settingsRepo.getByUser(userId);
  let conn = s?.activeConnectionId
    ? await connectionsRepo.getOne(userId, s.activeConnectionId)
    : undefined;
  if (!conn) conn = (await connectionsRepo.listByUser(userId))[0];
  return { conn, legacy: s };
}

// 사용자별 OpenAI 호환 LLM 연결. 코드에 모델명/공급사 하드코딩 금지 — 항상 이 함수로만 읽는다.
export async function getLlmConfig(userId: number): Promise<LlmConfig> {
  const { conn, legacy } = await activeConnection(userId);
  const apiKey = dec(conn ? conn.apiKey : legacy?.llmApiKey);
  const baseUrl = (conn ? conn.baseUrl : legacy?.llmBaseUrl)?.trim() || "";
  const model = (conn ? conn.model : legacy?.llmModel)?.trim() || "";
  return {
    apiKey,
    baseUrl,
    model,
    configured: !!apiKey && !!baseUrl && !!model,
    supportsVision: conn?.supportsVision ?? false,
  };
}

export interface EmbedConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean;
}

// 임베딩 연결 — 메인 연결의 base_url/키 재사용, 모델만 별도(없으면 기본값).
export async function getEmbedConfig(userId: number): Promise<EmbedConfig> {
  const { conn, legacy } = await activeConnection(userId);
  const apiKey = dec(conn ? conn.apiKey : legacy?.llmApiKey);
  const baseUrl = (conn ? conn.baseUrl : legacy?.llmBaseUrl)?.trim() || "";
  const model =
    (conn ? conn.embeddingModel : legacy?.llmEmbeddingModel)?.trim() ||
    "text-embedding-3-small";
  return { apiKey, baseUrl, model, configured: !!apiKey && !!baseUrl };
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return "••••" + key.slice(-4);
}
