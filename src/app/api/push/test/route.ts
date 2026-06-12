import { getCurrentUser } from "@/lib/currentUser";
import { sendToUser, pushConfigured, type PushAction } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 파이프라인 점검용 — 본인에게 테스트 알림 발송.
// body(선택): { rich?: boolean, image?: string, actions?: [{action,title}] }
//   rich=true → 큰 이미지 + 액션 2개 샘플로 펼침/버튼 동작 확인. iOS는 기본형으로 표시.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) {
    return Response.json({ error: "서버에 VAPID 키가 설정되지 않았어요." }, { status: 503 });
  }
  const opt = (await req.json().catch(() => ({}))) as {
    rich?: boolean;
    image?: string;
    actions?: PushAction[];
  };

  const image = opt.image ?? (opt.rich ? "/icons/icon-512.png" : undefined);
  const actions =
    opt.actions?.slice(0, 2) ??
    (opt.rich
      ? [
          { action: "ack", title: "확인" },
          { action: "open", title: "열기" },
        ]
      : undefined);

  const sent = await sendToUser(user.id, {
    title: "하루등불",
    body: opt.rich
      ? "리치 알림 테스트예요 🔔\n큰 이미지와 버튼이 보이면 정상.\n(iOS는 기본형으로 표시)"
      : "알림이 정상 동작해요 🔔",
    url: "/",
    tag: "test",
    image,
    actions,
  });
  return Response.json({ ok: true, sent });
}
