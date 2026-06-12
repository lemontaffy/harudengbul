import { getCurrentUser } from "@/lib/currentUser";
import * as messagesRepo from "@/db/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// assistant 메시지면 단건, user 메시지면 그에 대한 응답까지 쌍 삭제(hard delete, 소유 스코프).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const mid = Number((await params).id);
  if (!Number.isInteger(mid)) return Response.json({ error: "bad id" }, { status: 400 });

  const msg = await messagesRepo.getOne(user.id, mid);
  if (!msg) return Response.json({ error: "없는 메시지" }, { status: 404 });

  if (msg.role === "user") {
    await messagesRepo.removeUserWithResponses(user.id, mid);
  } else {
    await messagesRepo.remove(user.id, mid);
  }
  return Response.json({ ok: true });
}
