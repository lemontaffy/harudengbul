import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { pushSubscriptions } from "../schema";

export type PushKeys = { p256dh: string; auth: string };
export type SubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** 구독 등록(멱등) — endpoint 가 unique. 같은 endpoint 면 user/keys 갱신(기기 재사용 대비). */
export async function subscribe(
  userId: number,
  endpoint: string,
  keys: PushKeys,
) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, keys })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, keys },
    });
}

export async function listByUser(userId: number) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/** 본인 구독 해지(소유 스코프). */
export async function removeForUser(userId: number, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

/** 만료/해지(404·410)된 구독 정리 — 내부용(발송 실패 시). */
export async function deleteByEndpoint(endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}
