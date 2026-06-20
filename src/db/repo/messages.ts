import { and, asc, count, desc, eq, gt, ilike, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../client";
import { messages } from "../schema";

export type MsgRole = "user" | "assistant" | "proactive";

export interface MessageSearchHit {
  id: number;
  /** 200자 절단된 메시지 내용. */
  content: string;
  role: MsgRole;
  personaId: number;
  createdAt: Date | null;
}

export async function add(
  userId: number,
  personaId: number,
  role: MsgRole,
  content: string,
  hadToolCall = false,
  attachmentPath: string | null = null,
) {
  const [row] = await db
    .insert(messages)
    .values({ userId, personaId, role, content, hadToolCall, attachmentPath })
    .returning();
  return row;
}

/** 첨부 사진 캡션 1회 저장(보조 모델이 생성). 소유 스코프. */
export async function setCaption(userId: number, id: number, caption: string) {
  await db
    .update(messages)
    .set({ attachmentCaption: caption })
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
}

/** 첨부 서빙 화이트리스트 — 본인(userId) 메시지에 등록된 attachment_path 인지(교차 유저 차단). */
export async function attachmentPathExists(
  url: string,
  userId: number,
): Promise<boolean> {
  const [r] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.attachmentPath, url), eq(messages.userId, userId)))
    .limit(1);
  return !!r;
}

/** 본인 소유 단건 조회(소유 검증). */
export async function getOne(userId: number, id: number) {
  return db.query.messages.findFirst({
    where: and(eq(messages.id, id), eq(messages.userId, userId)),
  });
}

/** assistant 단건 hard delete(소유 스코프). */
export async function remove(userId: number, id: number) {
  await db
    .delete(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
}

/** 본문 갱신(이어쓰기). 소유 스코프. */
export async function updateContent(userId: number, id: number, content: string) {
  await db
    .update(messages)
    .set({ content })
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
}

/** 핀 토글(고정/해제). 소유 스코프. 영향 행 0이면(없는/타인 메시지) 변화 없음. */
export async function setPinned(userId: number, id: number, pinned: boolean): Promise<boolean> {
  const res = await db
    .update(messages)
    .set({ pinned })
    .where(and(eq(messages.id, id), eq(messages.userId, userId)))
    .returning({ id: messages.id });
  return res.length > 0;
}

/** 현재 대화 상대의 고정 메시지 — 오래된→최신(채팅 흐름과 같은 순서). userId+personaId 스코프. */
export async function listPinned(userId: number, personaId: number) {
  return db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        eq(messages.personaId, personaId),
        eq(messages.pinned, true),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/**
 * user 메시지 + 그에 대한 응답(다음 user 메시지 전까지의 assistant/proactive)을 쌍 삭제.
 * 소유 검증 후, 같은 스레드에서 user 메시지 이후 ~ 다음 user 메시지 전까지 삭제.
 */
export async function removeUserWithResponses(userId: number, id: number) {
  const target = await db.query.messages.findFirst({
    where: and(eq(messages.id, id), eq(messages.userId, userId)),
  });
  if (!target || target.role !== "user") return false;

  // id는 단조 증가(삽입 순서) — createdAt(타임스탬프)는 JS Date 밀리초 절단 탓에
  // target 자기 행이 경계에 걸리는 정밀도 버그가 있어 id 기준으로 비교한다.
  const after = await db
    .select({ id: messages.id, role: messages.role })
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        eq(messages.personaId, target.personaId),
        gt(messages.id, target.id),
      ),
    )
    .orderBy(asc(messages.id));

  const toDelete: number[] = [target.id];
  for (const m of after) {
    if (m.role === "user") break; // 다음 user 메시지부터는 별개
    toDelete.push(m.id);
  }
  await db
    .delete(messages)
    .where(and(eq(messages.userId, userId), inArray(messages.id, toDelete)));
  return true;
}

/** 프롬프트용 — id <= throughId 인 최근 N턴(role/content), 오래된→최신.
 *  id 기준(단조 증가)이라 타임스탬프 밀리초 절단 문제를 피한다. */
export async function listForPromptThrough(
  userId: number,
  personaId: number,
  throughId: number,
  limit = 20,
) {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      attachmentPath: messages.attachmentPath,
      attachmentCaption: messages.attachmentCaption,
    })
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        eq(messages.personaId, personaId),
        lte(messages.id, throughId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows.reverse();
}

/**
 * 화면용 페이지 — beforeId 없으면 최신 limit개, 있으면 그 id 이전 limit개(오래된→최신).
 * hasMore = 더 과거 메시지가 있는지(렉 방지 "이전 더 보기").
 */
export async function listViewPage(
  userId: number,
  personaId: number,
  beforeId: number | null,
  limit = 40,
) {
  const conds = [eq(messages.userId, userId), eq(messages.personaId, personaId)];
  if (beforeId) conds.push(lt(messages.id, beforeId));
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  return { messages: page, hasMore };
}

/** 화면용 — 캐릭터별 스레드, 오래된→최신 순. */
export async function listForView(
  userId: number,
  personaId: number,
  limit = 100,
) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** 대시보드 미리보기용 — 그 스레드 최신 1건. */
export async function lastMessage(userId: number, personaId: number) {
  const [row] = await db
    .select({
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row ?? null;
}

/** 안읽음 수 — lastReadAt 이후의 assistant/proactive 메시지. null이면 전체. */
export async function countUnread(
  userId: number,
  personaId: number,
  lastReadAt: Date | null,
): Promise<number> {
  const conds = [
    eq(messages.userId, userId),
    eq(messages.personaId, personaId),
    inArray(messages.role, ["assistant", "proactive"]),
  ];
  if (lastReadAt) conds.push(gt(messages.createdAt, lastReadAt));
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(...conds));
  return row?.n ?? 0;
}

/** memoryJob 용 — sinceId 이후 메시지(오래된→최신). 토큰 한도 위해 limit. */
export async function listSinceId(userId: number, sinceId: number, limit = 200) {
  return db
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, userId), gt(messages.id, sinceId)))
    .orderBy(asc(messages.id))
    .limit(limit);
}

/**
 * 과거 대화 검색(search_past_messages 도구의 백엔드). userId 스코프 필수.
 * 검색 방식: content ILIKE '%query%' 우선, 부족하면 similarity(content, query) 트라이그램 보조.
 *   정렬은 유사도 → 최신순. **이 함수 내부만 교체하면 pgvector RAG 로 전환 가능**
 *   (도구 인터페이스/격리 필터는 그대로) — 의도적 분리.
 * 격리: onlyPersonaId(그 캐릭터 방만) / excludePersonaIds(그 캐릭터 방들 제외) 중 호출자가 강제.
 */
export async function searchMessages(
  userId: number,
  query: string,
  opts: {
    excludePersonaIds?: number[];
    onlyPersonaId?: number;
    limit?: number;
  } = {},
): Promise<MessageSearchHit[]> {
  const q = query.trim();
  const limit = opts.limit ?? 5;
  if (!q || limit <= 0) return [];

  const scope = [eq(messages.userId, userId)];
  if (opts.onlyPersonaId != null) {
    scope.push(eq(messages.personaId, opts.onlyPersonaId));
  } else if (opts.excludePersonaIds && opts.excludePersonaIds.length > 0) {
    scope.push(notInArray(messages.personaId, opts.excludePersonaIds));
  }

  const cols = {
    id: messages.id,
    content: messages.content,
    role: messages.role,
    personaId: messages.personaId,
    createdAt: messages.createdAt,
  };
  const trunc = (r: { content: string }): string =>
    r.content.length > 200 ? r.content.slice(0, 200) + "…" : r.content;
  const toHit = (r: {
    id: number;
    content: string;
    role: string;
    personaId: number;
    createdAt: Date | null;
  }): MessageSearchHit => ({
    id: r.id,
    content: trunc(r),
    role: r.role as MsgRole,
    personaId: r.personaId,
    createdAt: r.createdAt,
  });

  // 1차: 부분일치(ILIKE) — 최신순.
  const exact = await db
    .select(cols)
    .from(messages)
    .where(and(...scope, ilike(messages.content, `%${q}%`)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  if (exact.length >= limit) return exact.map(toHit);

  // 보조: 트라이그램 유사도(부분일치에서 안 잡힌 행만). 유사도 → 최신순.
  const seen = new Set(exact.map((r) => r.id));
  const sim = sql<number>`similarity(${messages.content}, ${q})`;
  const fuzzy = await db
    .select({ ...cols, sim })
    .from(messages)
    .where(and(...scope, sql`${sim} > 0.1`))
    .orderBy(desc(sim), desc(messages.createdAt))
    .limit(limit * 3);
  const extra = fuzzy
    .filter((r) => !seen.has(r.id))
    .slice(0, limit - exact.length);
  return [...exact, ...extra].map(toHit);
}

export interface RoomMsgHit {
  id: number;
  role: MsgRole;
  content: string;
  pinned: boolean;
  createdAt: Date | null;
}

/**
 * 대화방 내 검색 — 현재 대화 상대(personaId)의 메시지만. userId+personaId 스코프 필수.
 * 본문 ILIKE(부분일치) 우선, 부족하면 트라이그램 유사도 보조(messages_content_trgm_idx, 0017).
 * 전체 원문을 돌려준다(스니펫은 호출부에서 매칭 둘레만 잘라낸다). 최신순.
 */
export async function searchInRoom(
  userId: number,
  personaId: number,
  query: string,
  limit = 50,
): Promise<RoomMsgHit[]> {
  const q = query.trim();
  if (!q || limit <= 0) return [];

  const scope = [eq(messages.userId, userId), eq(messages.personaId, personaId)];
  const cols = {
    id: messages.id,
    role: messages.role,
    content: messages.content,
    pinned: messages.pinned,
    createdAt: messages.createdAt,
  };
  const toHit = (r: {
    id: number;
    role: string;
    content: string;
    pinned: boolean;
    createdAt: Date | null;
  }): RoomMsgHit => ({ ...r, role: r.role as MsgRole });

  const exact = await db
    .select(cols)
    .from(messages)
    .where(and(...scope, ilike(messages.content, `%${q}%`)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  if (exact.length >= limit) return exact.map(toHit);

  const seen = new Set(exact.map((r) => r.id));
  const sim = sql<number>`similarity(${messages.content}, ${q})`;
  const fuzzy = await db
    .select(cols)
    .from(messages)
    .where(and(...scope, sql`${sim} > 0.1`))
    .orderBy(desc(sim), desc(messages.createdAt))
    .limit(limit * 3);
  const extra = fuzzy.filter((r) => !seen.has(r.id)).slice(0, limit - exact.length);
  return [...exact, ...extra].map(toHit);
}

/** 프롬프트용 — 최근 N턴(role/content만), 오래된→최신. */
export async function listForPrompt(
  userId: number,
  personaId: number,
  limit = 20,
) {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      attachmentPath: messages.attachmentPath,
      attachmentCaption: messages.attachmentCaption,
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
