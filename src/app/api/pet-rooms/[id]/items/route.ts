import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as itemsRepo from "@/db/repo/petItems";
import * as petsRepo from "@/db/repo/pets";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  return Response.json({ items: await itemsRepo.listForRoom(user.id, id) });
}

// 아이템 추가 — 스프라이트 업로드 + 이름 + 내구도 상한(무한 옵션) + (선택) 특정 펫에게 주기.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const brokenFile = form?.get("brokenFile"); // 파손 모양(선택)
  const name = String(form?.get("name") ?? "").trim();
  const pixel = form?.get("pixelRender");
  const durRaw = String(form?.get("durabilityMax") ?? "").trim();
  const heldRaw = String(form?.get("heldByPetId") ?? "").trim();
  const posXRaw = Number(form?.get("posX"));
  const posYRaw = Number(form?.get("posY"));
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });

  // 내구도 상한: 빈값/'0'/'infinite' → null(무한). 그 외 1~999 정수.
  let durabilityMax: number | null = null;
  if (durRaw && durRaw !== "0" && durRaw !== "infinite") {
    const n = Math.round(Number(durRaw));
    if (Number.isFinite(n) && n >= 1) durabilityMax = Math.min(999, n);
  }

  // held 펫은 반드시 본인 소유 검증.
  let heldByPetId: number | null = null;
  if (heldRaw) {
    const pid = Number(heldRaw);
    if (Number.isInteger(pid)) {
      const pet = await petsRepo.getOne(user.id, pid);
      if (pet) heldByPetId = pid;
    }
  }

  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    const brokenPath = brokenFile instanceof File ? (await saveSprite(user.id, brokenFile, { allowJpeg: true })).path : null;
    const row = await itemsRepo.add({
      userId: user.id,
      roomId: id,
      name,
      spritePath: path,
      brokenSpritePath: brokenPath,
      pixelRender: pixel == null ? true : pixel === "true",
      durabilityMax,
      heldByPetId,
      ...(Number.isFinite(posXRaw) ? { posX: posXRaw } : {}),
      ...(Number.isFinite(posYRaw) ? { posY: posYRaw } : {}),
    });
    return Response.json({ ok: true, item: row, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[pet-items] 추가 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
