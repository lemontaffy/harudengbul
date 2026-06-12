import { z } from "zod";
import { verifySnoozeToken } from "@/lib/snoozeToken";
import * as eventsRepo from "@/db/repo/events";
import * as snoozeTokensRepo from "@/db/repo/snoozeTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNOOZE_MIN = 10;
const bodySchema = z.object({ token: z.string().min(1) });

/**
 * 알람 '10분 뒤 다시' — 세션 없이 1회용 서명 토큰으로 인증(서비스워커에서 호출).
 * 서명·만료 검증 → 토큰 재사용 거부 → 해당 알람 10분 후 재푸시 예약.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "no token" }, { status: 400 });

  const claim = verifySnoozeToken(parsed.data.token);
  if (!claim) return Response.json({ error: "invalid or expired token" }, { status: 401 });

  // 1회용 — 같은 토큰 재사용 거부.
  const fresh = await snoozeTokensRepo.consume(claim.jti);
  if (!fresh) return Response.json({ error: "token already used" }, { status: 401 });

  const until = new Date(Date.now() + SNOOZE_MIN * 60_000);
  const ok = await eventsRepo.snoozeAlarm(claim.eventId, until);
  if (!ok) return Response.json({ error: "alarm not snoozable" }, { status: 409 });

  return Response.json({ ok: true, snoozeUntil: until.toISOString() });
}
