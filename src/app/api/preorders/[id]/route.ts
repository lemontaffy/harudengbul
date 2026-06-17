import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as preordersRepo from "@/db/repo/preorders";
import * as eventsRepo from "@/db/repo/events";
import { publicPreorder, reminderStartAt, reminderTitle } from "@/lib/preorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  balanceAmount: z.number().nonnegative().max(99_999_999).nullable().optional(),
  balanceKrwEstimate: z.number().int().min(0).max(1_000_000_000).optional(),
  balanceDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// 편집 — 잔금 예정일·금액·KRW추정·이름(pending). 예정일/이름 바뀌면 리마인더 갱신.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const cur = await preordersRepo.getOne(user.id, id);
  if (!cur) return Response.json({ error: "없는 예약" }, { status: 404 });
  if (cur.status !== "pending") return Response.json({ error: "완료된 예약은 수정 불가" }, { status: 409 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  await preordersRepo.update(user.id, id, {
    name: d.name,
    balanceAmount: d.balanceAmount != null ? String(d.balanceAmount) : d.balanceAmount, // 값/ null 모두 반영
    balanceKrwEstimate: d.balanceKrwEstimate,
    balanceDueDate: d.balanceDueDate,
  });

  // 리마인더 갱신(예정일·이름 변경 시).
  if (cur.reminderId && (d.balanceDueDate || d.name)) {
    try {
      await eventsRepo.update(user.id, cur.reminderId, {
        ...(d.balanceDueDate ? { startsAt: reminderStartAt(d.balanceDueDate) } : {}),
        ...(d.name ? { title: reminderTitle(d.name) } : {}),
      });
    } catch {
      /* 리마인더 갱신 실패 무시 */
    }
  }

  const row = await preordersRepo.getOne(user.id, id);
  return Response.json({ preorder: row ? publicPreorder(row) : null });
}

// 삭제(pending) — 예약 행 + 리마인더만 제거. 이미 기록된 보증금 거래는 실제 나간 돈이라 가계부에 유지.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const cur = await preordersRepo.getOne(user.id, id);
  if (!cur) return Response.json({ ok: true }); // 멱등
  if (cur.reminderId) {
    try {
      await eventsRepo.remove(user.id, cur.reminderId);
    } catch {
      /* 무시 */
    }
  }
  await preordersRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
