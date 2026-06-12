// 자가호스팅 SearxNG 기반 웹검색(v1: 검색 결과 메타만, 본문 fetch 제외).
//   실패해도 throw 하지 않는다 — 대화가 죽으면 안 되므로 표식만 반환.
const TIMEOUT_MS = 5000;

function baseUrl(): string {
  return (process.env.SEARXNG_URL?.trim() || "http://searxng:8080").replace(/\/+$/, "");
}

export interface WebResult {
  title: string;
  site: string; // 출처 사이트명(호스트)
  snippet: string;
}
export type WebSearchOutcome =
  | { ok: true; results: WebResult[] }
  | { ok: false; reason: string };

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * SearxNG JSON API 검색. {SEARXNG_URL}/search?q=...&format=json&language=ko
 * 5초 타임아웃, 실패 시 {ok:false, reason}.
 */
export async function searchWeb(
  query: string,
  limit = 5,
): Promise<WebSearchOutcome> {
  const q = query.trim();
  if (!q) return { ok: true, results: [] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url =
      `${baseUrl()}/search` +
      `?q=${encodeURIComponent(q)}&format=json&language=ko`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, reason: `검색 실패 (HTTP ${res.status})` };
    const data = (await res.json()) as { results?: unknown[] };
    const rows = Array.isArray(data.results) ? data.results : [];
    const results: WebResult[] = rows
      .slice(0, limit)
      .map((raw) => {
        const r = raw as { title?: string; url?: string; content?: string };
        return {
          title: (r.title ?? "").trim(),
          site: siteName(r.url ?? ""),
          snippet: (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        };
      })
      .filter((r) => r.title);
    return { ok: true, results };
  } catch {
    // 네트워크/타임아웃/파싱 실패 — 표식만(throw 금지).
    return { ok: false, reason: "검색 실패" };
  } finally {
    clearTimeout(timer);
  }
}
