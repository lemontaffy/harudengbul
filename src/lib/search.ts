// 통합 검색 — 순수 헬퍼(테스트 용이). 실제 조회는 repo, 조립은 /api/search.
//   대상: 채팅(messages) · 일기(diary_entries) · 주머니메모(memos). 전부 userId 스코프.

export type SearchType = "chat" | "diary" | "memo";

export interface SearchHit {
  type: SearchType;
  id: number;
  /** 채팅만 — 어느 대화 상대의 메시지인지. */
  personaId?: number;
  personaName?: string;
  /** 정렬·표시용 시각. 채팅/메모=createdAt ISO, 일기=entry_date(YYYY-MM-DD). */
  date: string | null;
  /** 매칭 부위 앞뒤를 잘라낸 스니펫. */
  snippet: string;
  /** 채팅 핀 여부(결과에서 살짝 강조). */
  pinned?: boolean;
  /** 탭 시 이동 경로(해당 위치로 포커스). */
  href: string;
}

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
