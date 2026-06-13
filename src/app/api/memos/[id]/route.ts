import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as memosRepo from "@/db/repo/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  done: z.boolean().optional(),
});

// 체크/해제 + 내용 수정.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const memo = await memosRepo.getOne(user.id, id);
  if (!memo) return Response.json({ error: "없는 메모" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;
  if (d.content !== undefined) await memosRepo.updateContent(user.id, id, d.content);
  if (d.done !== undefined) await memosRepo.setDone(user.id, id, d.done);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await memosRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
