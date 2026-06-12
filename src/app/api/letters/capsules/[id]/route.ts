import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as capsulesRepo from "@/db/repo/timeCapsules";
import * as personasRepo from "@/db/repo/personas";
import { isReopenable } from "@/lib/timecapsule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const patchSchema = z.object({
  content: z.string().trim().min(1).max(5000).optional(),
  deliverOn: z.string().regex(dateRe).optional(),
  personaId: z.number().int().nullable().optional(),
});

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 재열기 수정 — 저장 직후 5분 창 안 + 미배달 건만(봉인 원칙). 창 강제는 서버에서.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const cap = await capsulesRepo.getOne(user.id, id);
  if (!cap) return Response.json({ error: "없는 편지" }, { status: 404 });
  if (cap.deliveredAt) return Response.json({ error: "이미 배달된 편지예요." }, { status: 409 });
  if (!cap.createdAt || !isReopenable(cap.createdAt)) {
    return Response.json({ error: "봉인됐어요. 더 이상 열 수 없어요." }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  const patch: { content?: string; deliverOn?: string; personaId?: number | null } = {};
  if (d.content !== undefined) patch.content = d.content;
  if (d.deliverOn !== undefined) {
    if (d.deliverOn <= todayKst()) {
      return Response.json({ error: "도착일은 내일 이후로 정해주세요." }, { status: 400 });
    }
    patch.deliverOn = d.deliverOn;
  }
  if (d.personaId !== undefined) {
    if (d.personaId === null) patch.personaId = null;
    else {
      const p = await personasRepo.getOne(user.id, d.personaId);
      if (!p || !p.isActive) {
        return Response.json({ error: "배달 캐릭터를 다시 선택해주세요." }, { status: 400 });
      }
      patch.personaId = p.id;
    }
  }

  await capsulesRepo.update(user.id, id, patch);
  return Response.json({ ok: true });
}

// 삭제 — 봉인·배달 무관 언제나 가능.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await capsulesRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
