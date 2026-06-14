import { getCurrentUser } from "@/lib/currentUser";
import * as cssThemesRepo from "@/db/repo/cssThemes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await cssThemesRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
