import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as linesRepo from "@/db/repo/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const stage = new URL(req.url).searchParams.get("stage") ?? undefined;
  const lines = await linesRepo.listForPet(user.id, id, stage);
  return Response.json({ lines });
}

const addSchema = z.object({
  stage: z.enum(["baby", "teen", "adult"]),
  content: z.string().trim().min(1).max(60),
  aboutPetId: z.number().int().nullable().optional(),
});

// 직접 추가(무제한). aboutPetId 주면 about_other.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "대사를 입력하세요." }, { status: 400 });
  let aboutPetId = parsed.data.aboutPetId ?? null;
  if (aboutPetId != null) {
    const other = await petsRepo.getOne(user.id, aboutPetId);
    if (!other) aboutPetId = null;
  }
  const row = await linesRepo.addManual(id, parsed.data.stage, parsed.data.content, aboutPetId);
  return Response.json({ line: row });
}

const delSchema = z.object({ lineId: z.number().int() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await linesRepo.removeOne(user.id, parsed.data.lineId);
  return Response.json({ ok: true });
}
