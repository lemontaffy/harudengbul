import { getCurrentUser } from "@/lib/currentUser";
import { getQuote, isCurrencyCode } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 환율 조회 — 1 from = ? to. 기본 CNY→KRW(예약·잔금 환산용). 무료 소스(frankfurter), 캐시는 lib.
//   ?refresh=1 → 캐시 무시 강제 재조회(새로고침 버튼).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const from = (sp.get("from") ?? "CNY").toUpperCase();
  const to = (sp.get("to") ?? "KRW").toUpperCase();
  if (!isCurrencyCode(from) || !isCurrencyCode(to))
    return Response.json({ error: "통화 코드(3자리)" }, { status: 400 });

  const q = await getQuote(from, to, sp.get("refresh") === "1");
  if (!q) return Response.json({ error: "환율을 가져오지 못했어요" }, { status: 502 });
  return Response.json({ from, to, rate: q.rate, asOf: q.asOf || null, fetchedAt: q.fetchedAt });
}
