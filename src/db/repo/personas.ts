import { and, asc, eq, count } from "drizzle-orm";
import { db } from "../client";
import { personas, settings } from "../schema";
import type { Role } from "../../lib/persona";

export type PersonaRow = typeof personas.$inferSelect;

/** 활성 캐릭터만 (채팅 탭 / 트리거 할당 후보). id 오름차순. */
export async function listActiveByUser(userId: number) {
  return db
    .select()
    .from(personas)
    .where(and(eq(personas.userId, userId), eq(personas.isActive, true)))
    .orderBy(asc(personas.id));
}

/** 보관 포함 전체 (관리 화면). */
export async function listByUser(userId: number) {
  return db
    .select()
    .from(personas)
    .where(eq(personas.userId, userId))
    .orderBy(asc(personas.id));
}

/** 소유권 확인 포함 단건 조회. */
export async function getOne(userId: number, id: number) {
  return db.query.personas.findFirst({
    where: and(eq(personas.id, id), eq(personas.userId, userId)),
  });
}

export async function create(
  userId: number,
  input: {
    name: string;
    role: Role;
    traits?: string | null;
    avatarPath?: string | null;
  },
) {
  const [row] = await db
    .insert(personas)
    .values({
      userId,
      name: input.name,
      role: input.role,
      traits: input.traits ?? null,
      avatarPath: input.avatarPath ?? null,
    })
    .returning();
  return row;
}

export async function update(
  userId: number,
  id: number,
  patch: {
    name?: string;
    role?: Role;
    traits?: string | null;
    avatarPath?: string | null;
  },
) {
  await db
    .update(personas)
    .set(patch)
    .where(and(eq(personas.id, id), eq(personas.userId, userId)));
}

/** 이 캐릭터 스레드를 지금 읽은 것으로 표시(안읽음 배지 0으로). */
export async function markRead(userId: number, id: number) {
  await db
    .update(personas)
    .set({ lastReadAt: new Date() })
    .where(and(eq(personas.id, id), eq(personas.userId, userId)));
}

/** 삭제 대신 보관(is_active=false) — 대화 기록 보존. */
export async function archive(userId: number, id: number) {
  await db
    .update(personas)
    .set({ isActive: false })
    .where(and(eq(personas.id, id), eq(personas.userId, userId)));
}

/** 역할별 활성 캐릭터 수 — 역할별 최소 1명 강제 검사용. */
export async function countActiveByRole(
  userId: number,
  role: Role,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(personas)
    .where(
      and(
        eq(personas.userId, userId),
        eq(personas.role, role),
        eq(personas.isActive, true),
      ),
    );
  return row?.n ?? 0;
}

/**
 * 가입/시드용: 기본 캐릭터 2인(노라=상담가, 테오=비서) 생성 + settings 트리거 기본값 설정.
 * 멱등 — 이미 캐릭터가 있으면 아무것도 하지 않는다.
 * 트리거 기본값: 일기 답장=상담가(노라), 아침=비서(테오), 저녁=상담가(노라).
 */
export async function ensureDefaultsForUser(userId: number) {
  const [existing] = await db
    .select({ n: count() })
    .from(personas)
    .where(eq(personas.userId, userId));
  if ((existing?.n ?? 0) > 0) return;

  const nora = await create(userId, {
    name: "노라",
    role: "counselor",
    traits:
      "따뜻하지만 물러서지 않는다. 좋은 질문을 하나씩 던진다. 호들갑은 금지.",
  });
  const theo = await create(userId, {
    name: "테오",
    role: "secretary",
    traits:
      "차분하고 군더더기 없다. 가끔 건조한 농담. 걱정은 짧고 정확하게 표현한다.",
  });

  await db
    .update(settings)
    .set({
      activePersonaId: nora.id,
      diaryReplyPersonaId: nora.id,
      morningPersonaId: theo.id,
      eveningPersonaId: nora.id,
    })
    .where(eq(settings.userId, userId));
}

/**
 * settings 의 active/트리거 캐릭터 참조를 현재 활성 캐릭터 기준으로 보정.
 * 보관(archive)·역할 변경 후 호출 — 참조가 비활성이거나 트리거 역할과 안 맞으면
 * 해당 역할의 첫 활성 캐릭터로 재지정한다(역할별 최소 1명 보장 하에 항상 존재).
 *   diary_reply·evening = counselor, morning = secretary, active = 아무 활성 캐릭터.
 */
export async function normalizeSettingsForUser(userId: number) {
  const active = await listActiveByUser(userId);
  if (active.length === 0) return;
  const [s] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));
  if (!s) return;

  const firstOf = (role: Role) =>
    active.find((p) => p.role === role)?.id ?? null;
  const valid = (id: number | null, role?: Role) =>
    id != null && active.some((p) => p.id === id && (!role || p.role === role));

  const patch: Partial<typeof settings.$inferInsert> = {};
  if (!valid(s.activePersonaId)) patch.activePersonaId = active[0].id;
  if (!valid(s.diaryReplyPersonaId, "counselor"))
    patch.diaryReplyPersonaId = firstOf("counselor");
  if (!valid(s.morningPersonaId, "secretary"))
    patch.morningPersonaId = firstOf("secretary");
  if (!valid(s.eveningPersonaId, "counselor"))
    patch.eveningPersonaId = firstOf("counselor");

  if (Object.keys(patch).length > 0) {
    await db.update(settings).set(patch).where(eq(settings.userId, userId));
  }
}
