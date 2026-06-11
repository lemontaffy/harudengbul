import { eq } from "drizzle-orm";
import { db } from "../client";
import { diaryEntries } from "../schema";

export async function add(userId: number, entryDate: string, body: string) {
  const [row] = await db
    .insert(diaryEntries)
    .values({ userId, entryDate, body })
    .returning();
  return row;
}

export async function listByUser(userId: number) {
  return db
    .select()
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId));
}
