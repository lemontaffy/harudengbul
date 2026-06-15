// 상시알람 반복 규칙 — 순수 헬퍼(테스트 용이). tz 벽시계 기준.
//   'daily' = 매일 그 시각 / 'weekly:0,3' = 일·수 그 시각(0=일~6=토) / 'interval:N' = N분 간격.
export type Rule =
  | { kind: "daily" }
  | { kind: "weekly"; days: number[] } // 0=Sun..6=Sat
  | { kind: "interval"; minutes: number };

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null;
  if (s === "daily") return { kind: "daily" };
  if (s.startsWith("weekly:")) {
    const days = s
      .slice(7)
      .split(",")
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return days.length ? { kind: "weekly", days: [...new Set(days)].sort((a, b) => a - b) } : null;
  }
  if (s.startsWith("interval:")) {
    const m = Math.round(Number(s.slice(9)));
    return Number.isFinite(m) && m >= 1 ? { kind: "interval", minutes: m } : null;
  }
  return null;
}

export function ruleToString(r: Rule): string {
  if (r.kind === "daily") return "daily";
  if (r.kind === "weekly") return `weekly:${r.days.join(",")}`;
  return `interval:${r.minutes}`;
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export function describeRule(s: string | null | undefined): string {
  const r = parseRule(s);
  if (!r) return "반복";
  if (r.kind === "daily") return "매일";
  if (r.kind === "weekly") return `매주 ${r.days.map((d) => WD[d]).join("·")}`;
  const m = r.minutes;
  return m % 60 === 0 ? `${m / 60}시간마다` : `${m}분마다`;
}

// tz 의 (ymd, hh, mm) 벽시계를 절대시각으로(오프셋 트릭 — startOfTodayInTz 와 동형).
function tzWallToInstant(ymd: string, hh: number, mm: number, tz: string): Date {
  const base = new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  const off =
    new Date(base.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(base.toLocaleString("en-US", { timeZone: tz })).getTime();
  return new Date(base.getTime() + off);
}
function tzTimeOfDay(d: Date, tz: string): { hh: number; mm: number } {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const [hh, mm] = hm.split(":").map(Number);
  return { hh, mm };
}
function tzYmd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d);
}
function weekdayOfYmd(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 달력 날짜의 요일(tz 무관)
}

/**
 * `after` 보다 엄격히 이후인 다음 발생 시각. daily/weekly 는 `from` 의 tz 벽시계 시각을 유지,
 * interval 은 `from` 을 기준으로 N분씩. 없으면 null(366일 내 미발생 — weekly 빈 요일 등).
 */
export function nextOccurrence(rule: Rule, from: Date, tz: string, after: Date): Date | null {
  if (rule.kind === "interval") {
    const step = rule.minutes * 60000;
    const t0 = from.getTime();
    if (t0 > after.getTime()) return new Date(t0);
    const k = Math.ceil((after.getTime() - t0 + 1) / step);
    return new Date(t0 + k * step);
  }
  const { hh, mm } = tzTimeOfDay(from, tz);
  const afterYmd = tzYmd(after, tz);
  for (let i = 0; i <= 366; i++) {
    const ymd = addDaysYmd(afterYmd, i);
    if (rule.kind === "weekly" && !rule.days.includes(weekdayOfYmd(ymd))) continue;
    const inst = tzWallToInstant(ymd, hh, mm, tz);
    if (inst.getTime() > after.getTime()) return inst;
  }
  return null;
}

/** end_date(YYYY-MM-DD, 그날 포함) 가 지났는지 — 다음 발생의 tz 날짜가 end_date 보다 뒤면 종료. */
export function pastEndDate(next: Date, endDate: string | null, tz: string): boolean {
  if (!endDate) return false;
  return tzYmd(next, tz) > endDate;
}
