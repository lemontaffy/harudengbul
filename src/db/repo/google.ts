import { eq } from "drizzle-orm";
import { db } from "../client";
import { googleAccounts } from "../schema";

export type GoogleAccount = typeof googleAccounts.$inferSelect;

export async function getByUser(userId: number) {
  return db.query.googleAccounts.findFirst({ where: eq(googleAccounts.userId, userId) });
}

/** 연결(또는 재연결). 토큰은 암호화된 값으로 받는다. */
export async function upsert(
  userId: number,
  v: {
    refreshToken: string;
    accessToken: string | null;
    tokenExpiry: Date | null;
    email: string | null;
  },
) {
  await db
    .insert(googleAccounts)
    .values({
      userId,
      refreshToken: v.refreshToken,
      accessToken: v.accessToken,
      tokenExpiry: v.tokenExpiry,
      email: v.email,
      connectedAt: new Date(),
      syncToken: null,
    })
    .onConflictDoUpdate({
      target: googleAccounts.userId,
      set: {
        refreshToken: v.refreshToken,
        accessToken: v.accessToken,
        tokenExpiry: v.tokenExpiry,
        email: v.email,
        connectedAt: new Date(),
        syncToken: null, // 재연결 시 full 재동기화
      },
    });
}

export async function updateTokens(userId: number, accessTokenEnc: string, tokenExpiry: Date) {
  await db
    .update(googleAccounts)
    .set({ accessToken: accessTokenEnc, tokenExpiry })
    .where(eq(googleAccounts.userId, userId));
}

export async function setSyncToken(userId: number, syncToken: string | null) {
  await db.update(googleAccounts).set({ syncToken }).where(eq(googleAccounts.userId, userId));
}

export async function setLastSync(userId: number, at: Date) {
  await db.update(googleAccounts).set({ lastSyncAt: at }).where(eq(googleAccounts.userId, userId));
}

export async function listAll() {
  return db.select().from(googleAccounts);
}

export async function disconnect(userId: number) {
  await db.delete(googleAccounts).where(eq(googleAccounts.userId, userId));
}
