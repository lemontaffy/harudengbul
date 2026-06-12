import { getCurrentUser } from "@/lib/currentUser";
import { generateWeeklyLetter } from "@/lib/letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 이번 주 회고 편지를 지금 생성(또는 갱신). 일요일 저녁 자동 발송과 별개로 수동 받기용.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const r = await generateWeeklyLetter(user.id);
  if ("skipped" in r) {
    return Response.json({ error: r.skipped }, { status: 422 });
  }
  return Response.json(r);
}
