import { getCurrentUser } from "@/lib/currentUser";
import * as repliesRepo from "@/db/repo/petLetterReplies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 합본 읽음 — 한 편지의 도착 답장 전체를 읽음 처리. 우체통 active 해제.
export async function POST(_req: Request, { params }: { params: Promise<{ letterId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const letterId = Number((await params).letterId);
  if (!Number.isInteger(letterId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await repliesRepo.markLetterRead(user.id, letterId);
  return Response.json({ ok: true });
}
