import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/petItems";
import * as petsRepo from "@/db/repo/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 위치·픽셀·소지 펫 변경.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const item = await itemsRepo.getOne(user.id, id);
  if (!item) return Response.json({ error: "없는 아이템" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.posX === "number" && typeof body.posY === "number") {
    await itemsRepo.setPosition(user.id, id, body.posX, body.posY);
  }
  if (typeof body.pixelRender === "boolean") {
    await itemsRepo.setPixel(user.id, id, body.pixelRender);
  }
  if (typeof body.scale === "number" && Number.isFinite(body.scale)) {
    await itemsRepo.setScale(user.id, id, Math.max(0.3, Math.min(3, body.scale)));
  }
  if ("heldByPetId" in body) {
    let pid: number | null = null;
    if (body.heldByPetId != null) {
      const n = Number(body.heldByPetId);
      if (Number.isInteger(n) && (await petsRepo.getOne(user.id, n))) pid = n;
    }
    await itemsRepo.setHeldBy(user.id, id, pid);
  }
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await itemsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
