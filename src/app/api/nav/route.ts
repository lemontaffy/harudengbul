import { getCurrentUser } from "@/lib/currentUser";
import * as personasRepo from "@/db/repo/personas";
import * as messagesRepo from "@/db/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 탭바용 — 관리자 여부 + 전 페르소나 미읽음 합계.
// 기존 countUnread repo 재사용(활성 페르소나 수만큼 합산, N 작음).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const personas = await personasRepo.listActiveByUser(user.id);
  let unreadTotal = 0;
  for (const p of personas) {
    unreadTotal += await messagesRepo.countUnread(
      user.id,
      p.id,
      p.lastReadAt ?? null,
    );
  }
  return Response.json({ isAdmin: user.role === "admin", unreadTotal });
}
