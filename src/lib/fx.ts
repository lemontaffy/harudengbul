// 환율 — 키 없는 무료 소스(frankfurter.app, ECB 기준). 가계부 외화 환산·환율 계산기에 사용.
// 호출량이 적어(사용자 수동 등록) 프로세스 메모리 캐시(TTL)면 충분. 실패 시 직전 캐시 폴백.

const cache = new Map<string, { rate: number; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6시간

const CODE_RE = /^[A-Za-z]{3}$/;
export function isCurrencyCode(s: string): boolean {
  return CODE_RE.test(s);
}

/** from→to 환율(1 from = ? to). 같은 통화면 1. 못 구하면 null. */
export async function getRate(from: string, to: string): Promise<number | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (!isCurrencyCode(f) || !isCurrencyCode(t)) return null;
  if (f === t) return 1;
  const key = `${f}>${t}`;
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.rate;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${f}&to=${t}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return c?.rate ?? null;
    const d = (await res.json()) as { rates?: Record<string, number> };
    const rate = d?.rates?.[t];
    if (typeof rate === "number" && rate > 0) {
      cache.set(key, { rate, at: Date.now() });
      return rate;
    }
    return c?.rate ?? null;
  } catch {
    return c?.rate ?? null; // 네트워크/타임아웃 → 직전 캐시(있으면)
  }
}

/** amount(from 통화) → to 통화 환산. 못 구하면 null. */
export async function convert(
  amount: number,
  from: string,
  to: string,
): Promise<{ value: number; rate: number } | null> {
  const rate = await getRate(from, to);
  if (rate == null) return null;
  return { value: amount * rate, rate };
}
