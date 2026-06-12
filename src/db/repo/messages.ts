import { and, asc, count, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "../client";
import { messages } from "../schema";

export type MsgRole = "user" | "assistant" | "proactive";

export async function add(
  userId: number,
  personaId: number,
  role: MsgRole,
  content: string,
  hadToolCall = false,
) {
  const [row] = await db
    .insert(messages)
    .values({ userId, personaId, role, content, hadToolCall })
    .returning();
  return row;
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
    .select({ role: messages.role, content: messages.content })
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

/** 프롬프트용 — 최근 N턴(role/content만), 오래된→최신. */
export async function listForPrompt(
  userId: number,
  personaId: number,
  limit = 20,
) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
