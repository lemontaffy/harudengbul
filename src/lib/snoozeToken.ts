import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// 알람 스누즈 1회용 서명 토큰. 서비스워커는 세션이 없으므로 이 토큰으로 해당 알람만 인증.
// 형식: `${eventId}.${exp}.${jti}.${sig}` (sig = HMAC-SHA256(secret, "eid.exp.jti")).
// exp = 만료(ms). jti = 1회용 nonce(재사용은 라우트에서 DB로 거부).

const TTL_MS = 30 * 60 * 1000; // 30분

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s) throw new Error("SESSION_SECRET 미설정 — 스누즈 토큰 서명 불가");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueSnoozeToken(eventId: number, nowMs: number = Date.now()): string {
  const exp = nowMs + TTL_MS;
  const jti = randomUUID();
  const payload = `${eventId}.${exp}.${jti}`;
  return `${payload}.${sign(payload)}`;
}

export interface SnoozeClaim {
  eventId: number;
  jti: string;
}

/** 서명·만료 검증. 통과하면 {eventId, jti}(재사용 거부는 호출부 DB), 아니면 null. */
export function verifySnoozeToken(token: string, nowMs: number = Date.now()): SnoozeClaim | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [eidStr, expStr, jti, sig] = parts;
  const payload = `${eidStr}.${expStr}.${jti}`;
  const expected = sign(payload);
  // 길이 다르면 timingSafeEqual 이 throw — 먼저 길이 체크.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const exp = Number(expStr);
  const eventId = Number(eidStr);
  if (!Number.isFinite(exp) || !Number.isInteger(eventId)) return null;
  if (nowMs > exp) return null; // 만료
  return { eventId, jti };
}
