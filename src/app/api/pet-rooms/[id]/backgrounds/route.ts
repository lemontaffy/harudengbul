import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as bgRepo from "@/db/repo/roomBackgrounds";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  return Response.json({ panels: await bgRepo.listForRoom(user.id, id) });
}

// 패널 추가(맨 뒤). 배경은 JPEG 도 허용.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const pixel = form?.get("pixelRender");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    const row = await bgRepo.append(id, path, pixel == null ? true : pixel === "true");
    return Response.json({ ok: true, panel: row, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[room bg] 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
