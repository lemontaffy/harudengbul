import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as pocketRepo from "@/db/repo/pocket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cards = await pocketRepo.listByUser(user.id);
  return Response.json({ cards: cards.map((c) => ({ id: c.id, body: c.body })) });
}

const addSchema = z.object({ body: z.string().trim().min(1).max(500) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "내용을 입력하세요." }, { status: 400 });
  const row = await pocketRepo.add(user.id, parsed.data.body);
  return Response.json({ card: { id: row.id, body: row.body } });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });
  await pocketRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
