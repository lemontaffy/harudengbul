import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema";

export type Role = "admin" | "member";

export async function countUsers(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function findByUsername(username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) });
}

/** 활성 사용자만 반환 (비활성=즉시 차단). */
export async function findActiveById(id: number) {
  return db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.isActive, true)),
  });
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
  role?: Role;
}) {
  const [row] = await db
    .insert(users)
    .values({
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? "member",
    })
    .returning();
  return row;
}

export async function findById(id: number) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function listUsers() {
  return db.query.users.findMany({ orderBy: (u, { asc }) => asc(u.id) });
}

export async function setActive(id: number, isActive: boolean) {
  await db.update(users).set({ isActive }).where(eq(users.id, id));
}

/** 비밀번호 해시 교체. mustChange=true 면 다음 로그인에 변경 강제. */
export async function setPassword(
  id: number,
  passwordHash: string,
  mustChange: boolean,
) {
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: mustChange })
    .where(eq(users.id, id));
}
