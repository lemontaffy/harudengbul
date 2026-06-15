import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import * as givesRepo from "@/db/repo/itemGives";
import { ensureGiveLine, effectFor, fullLine } from "@/lib/itemGive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 식후 '배부름' 짧은 쿨다운(게이지 아님) — 바로 또 주면 새 반응 대신 차분 1개.
const FULL_COOLDOWN_MS = 90_000;

// v7 식품 급여 — consumable asset(풀)을 펫에게 먹인다. 인스턴스 안 만들고, 먹고 사라짐(반응만).
//   [id] = asset(items) id. 내구도·배치·소유 없음. 식후 배부름 쿨다운만.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const assetId = Number((await params).id);
  if (!Number.isInteger(assetId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { petId?: number };
  const petId = Number(body.petId);
  if (!Number.isInteger(petId)) return Response.json({ error: "먹일 펫을 고르세요." }, { status: 400 });

  const [asset, pet] = await Promise.all([
    itemsRepo.getOne(user.id, assetId),
    petsRepo.getOne(user.id, petId),
  ]);
  if (!asset || asset.kind !== "item" || !asset.consumable)
    return Response.json({ error: "식품이 아니에요." }, { status: 400 });
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  // 식후 배부름 — 직전에 같은 음식을 줬으면 차분히 거른다(허기 게이지 아님, 짧은 쿨다운).
  const last = await givesRepo.lastGiveAt(user.id, petId, assetId);
  if (last && Date.now() - new Date(last).getTime() < FULL_COOLDOWN_MS) {
    await givesRepo.log(user.id, petId, assetId);
    return Response.json({ full: true, content: fullLine(), effect: null });
  }

  const content = await ensureGiveLine(
    user.id,
    { id: asset.id, name: asset.name },
    { id: pet.id, name: pet.name, personality: pet.personality },
    "eating",
  );
  await givesRepo.log(user.id, petId, assetId);
  return Response.json({ full: false, content, effect: effectFor("eating") });
}
