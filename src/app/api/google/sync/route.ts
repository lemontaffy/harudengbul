import { getCurrentUser } from "@/lib/currentUser";
import { syncUser } from "@/lib/googlesync";
import * as googleRepo from "@/db/repo/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수동 동기화(본인).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const account = await googleRepo.getByUser(user.id);
  if (!account) return Response.json({ error: "Google 미연결" }, { status: 400 });
  try {
    const r = await syncUser(user.id);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error("[google] 수동 동기화 실패:", (err as Error)?.message);
    return Response.json({ error: "동기화 실패 — 다시 연결해 보세요." }, { status: 502 });
  }
}
