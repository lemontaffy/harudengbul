import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as preordersRepo from "@/db/repo/preorders";
import * as txRepo from "@/db/repo/transactions";
import * as eventsRepo from "@/db/repo/events";
import { publicPreorder } from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  balanceKrwActual: z.number().int().min(0).max(1_000_000_000),
});

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 잔금 완료 — 잔금을 *실제 거래*로 가계부에 기록 + status=paid + 리마인더 취소.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const cur = await preordersRepo.getOne(user.id, id);
  if (!cur) return Response.json({ error: "없는 예약" }, { status: 404 });
  if (cur.status !== "pending") return Response.json({ error: "이미 완료된 예약" }, { status: 409 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const balanceKrwActual = parsed.data.balanceKrwActual;

  // 잔금 = 이제 실제로 나간 돈 → 가계부 내역에 기록(오늘 날짜).
  const balanceTxn = await txRepo.create(user.id, {
    txDate: todayKst(),
    kind: "expense",
    category: "예약 잔금",
    amount: balanceKrwActual,
    memo: cur.name,
  });

  await preordersRepo.markPaid(user.id, id, {
    balanceKrwActual,
    balanceTxnId: balanceTxn.id,
    paidAt: new Date(),
  });

  // 리마인더 취소.
  if (cur.reminderId) {
    try {
      await eventsRepo.remove(user.id, cur.reminderId);
    } catch {
      /* 무시 */
    }
  }

  const row = await preordersRepo.getOne(user.id, id);
  return Response.json({ preorder: row ? publicPreorder(row) : null });
}
