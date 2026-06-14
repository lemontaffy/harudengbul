import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/petItems";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 파손 모양 스프라이트 업로드/교체.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await itemsRepo.getOne(user.id, id))) return Response.json({ error: "없는 아이템" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  try {
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    await itemsRepo.setBrokenSprite(user.id, id, path);
    return Response.json({ ok: true, brokenSpritePath: path, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[pet-items] 파손 스프라이트 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}

// 파손 모양 해제 → CSS 금 오버레이로 폴백.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await itemsRepo.setBrokenSprite(user.id, id, null);
  return Response.json({ ok: true });
}
