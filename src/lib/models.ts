// 저장된 base_url + 키로 공급사의 GET /models 를 호출해 모델 목록을 가져온다.
// OpenAI 호환 응답({data:[{id,...}]})을 정규화. OpenRouter면 가격·컨텍스트도 포함.
// base_url별 1시간 인메모리 캐시(목록은 키와 무관하게 공급사 카탈로그라 base_url 기준).

export interface NormalizedModel {
  id: string;
  name?: string;
  contextLength?: number;
  pricePrompt?: string; // USD per token (문자열)
  priceCompletion?: string;
}

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number;
  top_provider?: { context_length?: number };
  pricing?: { prompt?: string | number; completion?: string | number };
}

interface CacheEntry {
  at: number;
  source: string;
  models: NormalizedModel[];
}

const TTL_MS = 60 * 60 * 1000; // 1시간
const cache = new Map<string, CacheEntry>();

function normKey(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function priceStr(v: string | number | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s === "" ? undefined : s;
}

export interface ModelsResult {
  source: string;
  models: NormalizedModel[];
  cached: boolean;
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelsResult> {
  const base = normKey(baseUrl);

  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { source: hit.source, models: hit.models, cached: true };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`provider responded ${res.status}`);
  }

  const json = (await res.json()) as { data?: RawModel[] } | RawModel[];
  const arr: RawModel[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : [];

  const models: NormalizedModel[] = arr
    .map((m): NormalizedModel => {
      const id = String(m.id ?? m.name ?? "");
      const ctx =
        typeof m.context_length === "number"
          ? m.context_length
          : typeof m.top_provider?.context_length === "number"
            ? m.top_provider.context_length
            : undefined;
      return {
        id,
        name: m.name && m.name !== id ? String(m.name) : undefined,
        contextLength: ctx,
        pricePrompt: priceStr(m.pricing?.prompt),
        priceCompletion: priceStr(m.pricing?.completion),
      };
    })
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  const source = base.includes("openrouter") ? "openrouter" : "openai-compatible";
  cache.set(base, { at: Date.now(), source, models });
  return { source, models, cached: false };
}
