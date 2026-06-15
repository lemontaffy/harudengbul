import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 라이브러리 item 스프라이트 교체(main=기본, alt=가구 active, broken=아이템 파손). 여러 방 배치에 공유 반영.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await itemsRepo.getOne(user.id, id))) return Response.json({ error: "없는 아이템" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slotRaw = String(form?.get("slot") ?? "main");
  const slot = slotRaw === "alt" ? "alt" : slotRaw === "broken" ? "broken" : "main";
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });

  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    await itemsRepo.setSprite(user.id, id, slot, path);
    return Response.json({ ok: true, path, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
