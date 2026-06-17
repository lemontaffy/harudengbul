import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as preordersRepo from "@/db/repo/preorders";
import * as txRepo from "@/db/repo/transactions";
import * as eventsRepo from "@/db/repo/events";
import {
  publicPreorder,
  reminderStartAt,
  reminderTitle,
  REMINDER_ALARM_MIN,
} from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cny = z.number().nonnegative().max(99_999_999).optional().nullable();
const krw = z.number().int().min(0).max(1_000_000_000);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(1).max(8).optional(),
  depositAmount: cny, // CNY (표시용)
  depositKrw: krw.refine((n) => n >= 1, "보증금 KRW"), // 실제 지불
  depositDate: ymd,
  balanceAmount: cny, // CNY (표시용)
  balanceKrwEstimate: krw, // 잔금 KRW 추정(대기 합계용)
  balanceDueDate: ymd,
});

// 예약·잔금 목록(전체 — 클라이언트가 pending/paid 분리). 잔금 예정일 오름차순.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await preordersRepo.listByUser(user.id);
  return Response.json({ preorders: rows.map(publicPreorder) });
}

// 예약 추가(등록): preorders 행 + *보증금 실제 거래* + 잔금 리마인더 생성.
//   대기 잔금(balance_krw_estimate)은 거래로 만들지 않음(분리 규칙).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  // 1) 보증금 = 실제 나간 돈 → 가계부 내역에 기록.
  const depositTxn = await txRepo.create(user.id, {
    txDate: d.depositDate,
    kind: "expense",
    category: "예약 보증금",
    amount: d.depositKrw,
    memo: d.name,
  });

  // 2) 잔금 예정일 며칠 전 리마인더(기존 일정/푸시 인프라 재사용 — Google 동기화 X, 로컬 이벤트).
  let reminderId: number | null = null;
  try {
    const ev = await eventsRepo.create(user.id, {
      title: reminderTitle(d.name),
      startsAt: reminderStartAt(d.balanceDueDate),
      alarmMinutesBefore: REMINDER_ALARM_MIN,
      category: "oneoff",
    });
    reminderId = ev.id;
  } catch {
    /* 리마인더 실패해도 예약 자체는 진행 */
  }

  // 3) preorders 행(대기) — 거래/리마인더 id 연결.
  const row = await preordersRepo.create(user.id, {
    name: d.name,
    currency: d.currency,
    depositAmount: d.depositAmount != null ? String(d.depositAmount) : null,
    depositKrw: d.depositKrw,
    depositDate: d.depositDate,
    balanceAmount: d.balanceAmount != null ? String(d.balanceAmount) : null,
    balanceKrwEstimate: d.balanceKrwEstimate,
    balanceDueDate: d.balanceDueDate,
    depositTxnId: depositTxn.id,
    reminderId,
  });

  return Response.json({ preorder: publicPreorder(row) });
}
