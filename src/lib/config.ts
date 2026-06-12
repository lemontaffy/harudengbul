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

// 연결 1행 → LlmConfig.
function connToConfig(conn: ConnectionRow): LlmConfig {
  const apiKey = dec(conn.apiKey);
  const baseUrl = conn.baseUrl?.trim() || "";
  const model = conn.model?.trim() || "";
  return {
    apiKey,
    baseUrl,
    model,
    configured: !!apiKey && !!baseUrl && !!model,
    supportsVision: conn.supportsVision ?? false,
  };
}

/**
 * 비전(이미지 인식) 가능한 연결을 통일된 규칙으로 고른다 — 배경 작업(사진 캡션 등) 전용.
 * 같은 일을 하는 연결 선택 코드가 두 벌 존재하지 않도록 캡션·일기 사진 인식이 공유한다.
 *   ① 보조 연결(aux_connection_id)이 비전 지원이면 그것.
 *   ② 아니면 비전 지원 연결 중 첫 번째.
 *   ③ 둘 다 없으면 null.
 */
export async function pickVisionConn(userId: number): Promise<LlmConfig | null> {
  const s = await settingsRepo.getByUser(userId);
  if (s?.auxConnectionId) {
    const aux = await connectionsRepo.getOne(userId, s.auxConnectionId);
    if (aux?.supportsVision) {
      const cfg = connToConfig(aux);
      if (cfg.configured) return cfg;
    }
  }
  const conns = await connectionsRepo.listByUser(userId);
  const vision = conns.find((c) => c.supportsVision);
  if (vision) {
    const cfg = connToConfig(vision);
    if (cfg.configured) return cfg;
  }
  return null;
}

/**
 * 보조 텍스트 작업(펫 대사 등) 연결 — 비전 불필요. 보조 연결(aux_connection_id) 우선, 없으면 메인.
 * 페르소나 프롬프트 미탑재 배경 작업 전용.
 */
export async function getAuxTextConfig(userId: number): Promise<LlmConfig> {
  const s = await settingsRepo.getByUser(userId);
  if (s?.auxConnectionId) {
    const aux = await connectionsRepo.getOne(userId, s.auxConnectionId);
    if (aux) {
      const cfg = connToConfig(aux);
      if (cfg.configured) return cfg;
    }
  }
  return getLlmConfig(userId);
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
