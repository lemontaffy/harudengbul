import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["letters", "memo", "diary", "pet_diary", "achievements", "none"];

// 메타 수정(JSON) — 이름·소유 펫·픽셀 + 가구/아이템 속성. 스프라이트 교체는 별도(추후).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const cur = await itemsRepo.getOne(user.id, id);
  if (!cur) return Response.json({ error: "없는 아이템" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof itemsRepo.updateMeta>[2] = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.pixelRender === "boolean") patch.pixelRender = body.pixelRender;

  // ownerPetId: null 명시 가능(소유 해제). 값이 있으면 본인 펫 검증.
  if ("ownerPetId" in body) {
    const v = body.ownerPetId;
    if (v == null || v === "") patch.ownerPetId = null;
    else {
      const pid = Number(v);
      if (!Number.isInteger(pid) || !(await petsRepo.getOne(user.id, pid)))
        return Response.json({ error: "없는 펫" }, { status: 400 });
      patch.ownerPetId = pid;
    }
  }

  // 가구 속성(가구일 때만 의미)
  if (cur.kind === "furniture") {
    if (body.furnitureKind === "seat" || body.furnitureKind === "fixture")
      patch.furnitureKind = body.furnitureKind;
    if (typeof body.type === "string") patch.type = body.type.trim() || null;
    if (typeof body.actionType === "string")
      patch.actionType = ACTIONS.includes(body.actionType) ? body.actionType : "none";
    if (body.facing === "left" || body.facing === "right") patch.facing = body.facing;
    if (typeof body.seatY === "number" && Number.isFinite(body.seatY))
      patch.seatY = Math.max(0, Math.min(100, body.seatY));
  }

  // 아이템 속성
  if (cur.kind === "item") {
    if ("durabilityMax" in body) {
      const v = body.durabilityMax;
      patch.durabilityMax =
        v == null || v === "" ? null : Math.max(1, Math.floor(Number(v) || 1));
    }
    if (typeof body.durabilityNow === "number" && Number.isFinite(body.durabilityNow))
      patch.durabilityNow = Math.max(0, Math.floor(body.durabilityNow));
  }

  await itemsRepo.updateMeta(user.id, id, patch);
  return Response.json({ ok: true });
}

// 삭제 — userId 스코프. 가구면 furniture_placements 가 FK cascade 로 함께 제거(라우트는 그냥 삭제,
//   "N개 방에서 제거됩니다" 확인은 클라이언트가 사전 표시). 절대 다른 유저 행 안 건드림.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await itemsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
