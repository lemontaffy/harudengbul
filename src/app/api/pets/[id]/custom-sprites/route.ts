import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as customRepo from "@/db/repo/petCustomSprites";
import { saveSprite, SpriteError } from "@/lib/petSprites";
import { STAGES } from "@/lib/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREQ = ["often", "sometimes", "manual"];

// 커스텀 모션 추가 — 스프라이트(GIF/WebP/PNG) + 스테이지/이름/빈도/대사(선택).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const stage = String(form?.get("stage") ?? "");
  const name = String(form?.get("name") ?? "").trim();
  const frequency = String(form?.get("frequency") ?? "sometimes");
  const line = String(form?.get("line") ?? "").trim() || null;
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (!(STAGES as string[]).includes(stage)) return Response.json({ error: "잘못된 스테이지" }, { status: 400 });
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });
  if (!FREQ.includes(frequency)) return Response.json({ error: "잘못된 빈도" }, { status: 400 });

  try {
    const { path, warning } = await saveSprite(user.id, file); // 스프라이트는 JPEG 불허
    const row = await customRepo.create(id, { stage, name, path, frequency, line });
    return Response.json({ ok: true, customSprite: row, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[custom sprite] 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}

const delSchema = z.object({ customId: z.number().int() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await customRepo.remove(user.id, parsed.data.customId);
  return Response.json({ ok: true });
}
