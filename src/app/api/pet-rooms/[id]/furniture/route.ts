import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as furnitureRepo from "@/db/repo/roomFurniture";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["letters", "memo", "diary", "none"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  return Response.json({ furniture: await furnitureRepo.listForRoom(user.id, id) });
}

// 가구 추가 — 스프라이트 업로드 + 유형(seat/fixture) + (fixture면)액션. 가구 스프라이트도 JPEG 허용.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const altFile = form?.get("altFile"); // 알림 스프라이트(선택)
  const kindRaw = String(form?.get("kind") ?? "");
  const typeRaw = String(form?.get("type") ?? "").trim();
  const actionRaw = String(form?.get("actionType") ?? "");
  const pixel = form?.get("pixelRender");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (kindRaw !== "seat" && kindRaw !== "fixture")
    return Response.json({ error: "유형(seat/fixture)을 고르세요." }, { status: 400 });
  const kind = kindRaw as "seat" | "fixture";
  // fixture만 액션을 가진다. 미지정/잘못된 값은 'none'(순수 장식).
  const actionType = kind === "fixture" ? (ACTIONS.includes(actionRaw) ? actionRaw : "none") : null;
  const type = typeRaw || (kind === "seat" ? "seat" : actionType ?? "fixture");

  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    const altPath = altFile instanceof File ? (await saveSprite(user.id, altFile, { allowJpeg: true })).path : null;
    const row = await furnitureRepo.add({
      roomId: id,
      kind,
      type,
      spritePath: path,
      spriteAltPath: altPath,
      pixelRender: pixel == null ? true : pixel === "true",
      actionType,
    });
    return Response.json({ ok: true, furniture: row, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[furniture] 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
