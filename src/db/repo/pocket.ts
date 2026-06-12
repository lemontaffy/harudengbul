import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { pocketCards } from "../schema";

export async function listByUser(userId: number) {
  return db
    .select()
    .from(pocketCards)
    .where(eq(pocketCards.userId, userId))
    .orderBy(desc(pocketCards.createdAt));
}

export async function add(userId: number, body: string) {
  const [row] = await db
    .insert(pocketCards)
    .values({ userId, body })
    .returning();
  return row;
}

export async function remove(userId: number, id: number) {
  await db
    .delete(pocketCards)
    .where(and(eq(pocketCards.id, id), eq(pocketCards.userId, userId)));
}
