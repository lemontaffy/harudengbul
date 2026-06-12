import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as relationsRepo from "@/db/repo/petRelations";
import { stageFor } from "@/lib/pets";
import { regenerateForPair } from "@/lib/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  petA: z.number().int(),
  petB: z.number().int(),
  label: z.string().trim().min(1).max(30),
});
const delSchema = z.object({ petA: z.number().int(), petB: z.number().int() });

async function bothOwned(userId: number, a: number, b: number) {
  if (a === b) return null;
  const pa = await petsRepo.getOne(userId, a);
  const pb = await petsRepo.getOne(userId, b);
  return pa && pb ? { pa, pb } : null;
}

// 관계 선언/수정 — 사용자 설정. 시스템이 임의 변경하지 않는다.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const { petA, petB, label } = parsed.data;
  const owned = await bothOwned(user.id, petA, petB);
  if (!owned) return Response.json({ error: "두 펫을 다시 선택하세요." }, { status: 400 });

  await relationsRepo.upsert(user.id, petA, petB, label);
  // 관계 변경 → 양쪽 about_other 대사 갱신(best-effort).
  const stage = stageFor(owned.pa.growthPoints, owned.pa.teenThreshold, owned.pa.adultThreshold);
  void regenerateForPair(user.id, petA, petB, stage).catch(() => {});
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const { petA, petB } = parsed.data;
  await relationsRepo.removePair(user.id, petA, petB);
  const owned = await bothOwned(user.id, petA, petB);
  if (owned) {
    const stage = stageFor(owned.pa.growthPoints, owned.pa.teenThreshold, owned.pa.adultThreshold);
    void regenerateForPair(user.id, petA, petB, stage).catch(() => {});
  }
  return Response.json({ ok: true });
}
