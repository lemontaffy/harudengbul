import type { EmbedConfig } from "@/lib/config";

// OpenAI 호환 임베딩. 1536차원 고정(text-embedding-3-small 등). 실패·차원 불일치 → null(폴백).
export const EMBED_DIM = 1536;

function normBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function embed(cfg: EmbedConfig, text: string): Promise<number[] | null> {
  if (!cfg.configured) return null;
  const input = text.trim().slice(0, 8000);
  if (!input) return null;
  try {
    const res = await fetch(`${normBase(cfg.baseUrl)}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, input }),
    });
    if (!res.ok) {
      console.error("[embed] HTTP", res.status);
      return null;
    }
    const json = await res.json();
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
      console.error("[embed] 차원 불일치", Array.isArray(vec) ? vec.length : typeof vec);
      return null;
    }
    return vec as number[];
  } catch (err) {
    console.error("[embed] 실패:", (err as Error)?.message);
    return null;
  }
}

/** pgvector 입력 리터럴 — `[0.1,0.2,...]`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
