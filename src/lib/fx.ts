// 환율 — 키 없는 무료 소스(frankfurter.app, ECB 기준). 가계부 외화 환산·환율 계산기에 사용.
// 호출량이 적어(사용자 수동 등록) 프로세스 메모리 캐시(TTL)면 충분. 실패 시 직전 캐시 폴백.

const cache = new Map<string, { rate: number; date: string; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6시간

const CODE_RE = /^[A-Za-z]{3}$/;
export function isCurrencyCode(s: string): boolean {
  return CODE_RE.test(s);
}

// 캐시/네트워크에서 환율 1건 로드. force=true 면 TTL 무시하고 강제 재조회(새로고침).
async function load(
  f: string,
  t: string,
  force = false,
): Promise<{ rate: number; date: string; at: number } | null> {
  const key = `${f}>${t}`;
  const c = cache.get(key);
  if (!force && c && Date.now() - c.at < TTL_MS) return c;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${f}&to=${t}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return c ?? null;
    const d = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rate = d?.rates?.[t];
    if (typeof rate === "number" && rate > 0) {
      const entry = { rate, date: d.date ?? "", at: Date.now() };
      cache.set(key, entry);
      return entry;
    }
    return c ?? null;
  } catch {
    return c ?? null; // 네트워크/타임아웃 → 직전 캐시(있으면)
  }
}

/** from→to 환율(1 from = ? to). 같은 통화면 1. 못 구하면 null. */
export async function getRate(from: string, to: string): Promise<number | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (!isCurrencyCode(f) || !isCurrencyCode(t)) return null;
  if (f === t) return 1;
  return (await load(f, t))?.rate ?? null;
}

export interface FxQuote {
  rate: number;
  asOf: string; // 환율 기준일(ECB 고시일, YYYY-MM-DD). 같은 통화면 빈 문자열.
  fetchedAt: string; // 우리가 받아온 시각(ISO).
}

/** 환율 + 기준일 + 받아온 시각. force=true 면 캐시 무시 강제 재조회. 못 구하면 null. */
export async function getQuote(from: string, to: string, force = false): Promise<FxQuote | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (!isCurrencyCode(f) || !isCurrencyCode(t)) return null;
  if (f === t) return { rate: 1, asOf: "", fetchedAt: new Date().toISOString() };
  const e = await load(f, t, force);
  return e ? { rate: e.rate, asOf: e.date, fetchedAt: new Date(e.at).toISOString() } : null;
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
