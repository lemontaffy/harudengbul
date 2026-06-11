// 가계부 빠른 입력 파서 — "점심 9천원" 같은 한 줄을 거래로. LLM 없이 정규식.
export interface ParsedTx {
  kind: "expense" | "income";
  category: string;
  amount: number; // KRW 정수
  memo: string | null;
}

const UNIT: Record<string, number> = { 억: 1e8, 만: 1e4, 천: 1e3 };
const INCOME_RE = /수입|월급|급여|용돈|받았|받음|입금|이자|환급|당첨/;

/** 한국어 금액/카테고리/종류 추출. 금액 인식 못 하면 null. */
export function parseQuickTx(text: string): ParsedTx | null {
  const raw = text.trim();
  if (!raw) return null;
  const kind: "expense" | "income" = INCOME_RE.test(raw) ? "income" : "expense";

  const s = raw.replace(/,/g, "");
  // 숫자(+선택 단위) 토큰들
  const re = /(\d+)\s*(억|만|천)?/g;
  const toks: { n: number; unit?: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    toks.push({ n: Number(m[1]), unit: m[2], start: m.index, end: m.index + m[0].length });
  }
  if (toks.length === 0) return null;

  // 뒤에서부터 '공백/원'만 사이에 둔 연속 토큰 = 금액 런(중간에 단어 끼면 끊음)
  let runStart = toks.length - 1;
  for (let i = toks.length - 1; i > 0; i--) {
    const gap = s.slice(toks[i - 1].end, toks[i].start);
    if (/^[\s원]*$/.test(gap)) runStart = i - 1;
    else break;
  }
  const run = toks.slice(runStart);
  const amount = run.reduce((a, t) => a + t.n * (t.unit ? UNIT[t.unit] : 1), 0);
  if (!amount || amount <= 0) return null;

  // 카테고리 = 금액 런 앞 + 뒤 텍스트(원·수입/지출 라벨 제거)
  const before = s.slice(0, run[0].start);
  const after = s.slice(run[run.length - 1].end);
  let category = `${before} ${after}`
    .replace(/원/g, " ")
    .replace(/수입|지출/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!category) category = "기타";

  return { kind, category: category.slice(0, 40), amount: Math.round(amount), memo: null };
}

// ── 월 집계 ──
export interface TxLike {
  kind: string;
  category: string;
  amount: number;
}
export interface Summary {
  expense: number;
  income: number;
  byCategory: { category: string; amount: number }[];
}

/** 지출/수입 합계 + 지출 카테고리별 합계(내림차순). 순수 함수. */
export function summarize(rows: TxLike[]): Summary {
  let expense = 0;
  let income = 0;
  const cat = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "income") income += r.amount;
    else {
      expense += r.amount;
      cat.set(r.category, (cat.get(r.category) ?? 0) + r.amount);
    }
  }
  const byCategory = [...cat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { expense, income, byCategory };
}
