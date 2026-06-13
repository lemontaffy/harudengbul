import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import { stageFor } from "@/lib/pets";
import { regenerateLines } from "@/lib/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ stage: z.enum(["baby", "teen", "adult"]).optional() });

// 자동 대사 풀 전체 재생성(보조 모델). 수동 대사는 보존(replaceAuto). stage 미지정이면 현재 성장 단계.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const stage =
    parsed.success && parsed.data.stage
      ? parsed.data.stage
      : stageFor(pet.growthPoints, pet.teenThreshold, pet.adultThreshold);

  const count = await regenerateLines(user.id, id, stage);
  if (count === 0) {
    return Response.json(
      { error: "보조 모델(AUX 연결)이 설정되어 있어야 재생성할 수 있어요.", count: 0 },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, count, stage });
}
