// 대화방 내 검색 — 순수 헬퍼(테스트 용이). 실제 조회는 messagesRepo, 조립은 /api/messages/search.

// 2글자 미만은 trgm 정확도가 급격히 떨어져 노이즈만 많다 → 안내 메시지로 막는다.
export const MIN_QUERY_LEN = 2;

/** 공백 정리한 질의. 빈 문자열이면 검색 안 함. */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

/**
 * 매칭 부위 둘레만 잘라낸 스니펫. 대소문자 무시 첫 일치 기준으로 앞뒤 pad 글자.
 * 일치가 없으면(트라이그램 유사 매칭 등) 앞부분을 보여준다. 줄바꿈은 공백으로.
 */
export function makeSnippet(text: string | null | undefined, query: string, pad = 30): string {
  const body = (text ?? "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  const q = query.trim();
  const idx = q ? body.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (idx < 0) {
    return body.length > pad * 2 + q.length ? body.slice(0, pad * 2 + q.length) + "…" : body;
  }
  const start = Math.max(0, idx - pad);
  const end = Math.min(body.length, idx + q.length + pad);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}
