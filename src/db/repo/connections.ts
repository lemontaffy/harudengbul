import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { llmConnections } from "../schema";

export type ConnectionRow = typeof llmConnections.$inferSelect;

export async function listByUser(userId: number) {
  return db
    .select()
    .from(llmConnections)
    .where(eq(llmConnections.userId, userId))
    .orderBy(asc(llmConnections.createdAt));
}

export async function getOne(userId: number, id: number) {
  return db.query.llmConnections.findFirst({
    where: and(eq(llmConnections.id, id), eq(llmConnections.userId, userId)),
  });
}

export async function countByUser(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(llmConnections)
    .where(eq(llmConnections.userId, userId));
  return row?.n ?? 0;
}

export async function create(
  userId: number,
  input: {
    name: string;
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    embeddingModel?: string | null;
  },
) {
  const [row] = await db
    .insert(llmConnections)
    .values({
      userId,
      name: input.name,
      apiKey: input.apiKey ?? null,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
      embeddingModel: input.embeddingModel ?? null,
    })
    .returning();
  return row;
}

export async function update(
  userId: number,
  id: number,
  patch: {
    name?: string;
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    embeddingModel?: string | null;
  },
) {
  await db
    .update(llmConnections)
    .set(patch)
    .where(and(eq(llmConnections.id, id), eq(llmConnections.userId, userId)));
}

export async function remove(userId: number, id: number) {
  await db
    .delete(llmConnections)
    .where(and(eq(llmConnections.id, id), eq(llmConnections.userId, userId)));
}
