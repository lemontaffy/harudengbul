import { getCurrentUser } from "@/lib/currentUser";
import * as furnitureRepo from "@/db/repo/roomFurniture";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가구 스프라이트 교체 — slot: 'main'(기본) | 'alt'(알림). 펫 스프라이트 업로드 로직 재사용.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const owned = await furnitureRepo.getOne(user.id, id);
  if (!owned) return Response.json({ error: "없는 가구" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slotRaw = String(form?.get("slot") ?? "main");
  const slot = slotRaw === "alt" ? "alt" : "main";
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });

  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    await furnitureRepo.setSprite(user.id, id, slot, path);
    return Response.json({ ok: true, path, slot, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[furniture sprite] 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
