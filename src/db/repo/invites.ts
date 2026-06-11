import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "../client";
import { invites, users } from "../schema";

/** 유효한 초대(미사용 + 미만료)만 반환. */
export async function findValid(code: string, now: Date) {
  return db.query.invites.findFirst({
    where: and(
      eq(invites.code, code),
      isNull(invites.usedBy),
      gt(invites.expiresAt, now),
    ),
  });
}

export async function issue(input: {
  code: string;
  createdBy: number;
  expiresAt: Date;
}) {
  const [row] = await db.insert(invites).values(input).returning();
  return row;
}

export async function markUsed(code: string, usedBy: number) {
  await db.update(invites).set({ usedBy }).where(eq(invites.code, code));
}

/** 미사용 초대 목록 (생성자 username 포함). */
export async function listOpen(now: Date) {
  return db
    .select({
      code: invites.code,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
      createdByName: users.username,
    })
    .from(invites)
    .leftJoin(users, eq(invites.createdBy, users.id))
    .where(isNull(invites.usedBy))
    .orderBy(desc(invites.createdAt));
}

/** 미사용 초대만 취소(삭제). 이미 사용된 코드는 건드리지 않음. */
export async function cancel(code: string) {
  await db
    .delete(invites)
    .where(and(eq(invites.code, code), isNull(invites.usedBy)));
}
