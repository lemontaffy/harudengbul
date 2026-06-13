import { getCurrentUser } from "@/lib/currentUser";
import * as repliesRepo from "@/db/repo/petLetterReplies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 답장 읽음 기록. 우체통 active(안 읽은 답장) 해제 → 방 재진입 시 닫힌 스프라이트.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await repliesRepo.markRead(user.id, id);
  return Response.json({ ok: true });
}
