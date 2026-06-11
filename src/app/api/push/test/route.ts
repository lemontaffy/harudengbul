import { getCurrentUser } from "@/lib/currentUser";
import { sendToUser, pushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 파이프라인 점검용 — 본인에게 테스트 알림 발송.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) {
    return Response.json({ error: "서버에 VAPID 키가 설정되지 않았어요." }, { status: 503 });
  }
  const sent = await sendToUser(user.id, {
    title: "하루등불",
    body: "알림이 정상 동작해요 🔔",
    url: "/",
    tag: "test",
  });
  return Response.json({ ok: true, sent });
}
