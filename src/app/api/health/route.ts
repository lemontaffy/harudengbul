// 배포/터널 점검용. 인증 불필요(미들웨어 예외, M2에서 처리).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "haru-app" });
}
