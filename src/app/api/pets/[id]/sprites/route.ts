import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import { saveSprite, SpriteError } from "@/lib/petSprites";
import { STAGES, SPRITE_KINDS } from "@/lib/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSlot(stage: unknown, kind: unknown): stage is string {
  return (
    typeof stage === "string" &&
    typeof kind === "string" &&
    (STAGES as string[]).includes(stage) &&
    (SPRITE_KINDS as string[]).includes(kind)
  );
}

// 스프라이트 슬롯 업로드(stage×kind). GIF/WebP/PNG 원본 보존(재인코딩 없음).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const stage = form?.get("stage");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (!validSlot(stage, kind)) return Response.json({ error: "잘못된 슬롯" }, { status: 400 });

  try {
    const { path, warning } = await saveSprite(user.id, file); // 스프라이트는 JPEG 불허
    await spritesRepo.upsertSlot(id, stage as string, kind as string, path);
    return Response.json({ ok: true, path, stage, kind, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[pet sprite] 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}

const delSchema = z.object({ stage: z.string(), kind: z.string() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !validSlot(parsed.data.stage, parsed.data.kind)) {
    return Response.json({ error: "잘못된 슬롯" }, { status: 400 });
  }
  await spritesRepo.deleteSlot(id, parsed.data.stage, parsed.data.kind);
  return Response.json({ ok: true });
}
