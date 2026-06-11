import { getCurrentUser } from "@/lib/currentUser";
import { vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 구독에 필요한 VAPID 공개키. (공개키는 비밀 아님 — 클라이언트가 applicationServerKey 로 사용)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const publicKey = vapidPublicKey();
  if (!publicKey) {
    return Response.json({ error: "푸시 미설정(VAPID 키 없음)", publicKey: null }, { status: 503 });
  }
  return Response.json({ publicKey });
}
