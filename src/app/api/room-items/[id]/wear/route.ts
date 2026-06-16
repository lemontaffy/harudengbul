import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import { breakageLine } from "@/lib/itemGive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 마모 1 — 인스턴스 내구도 1 감소, 0 도달 시 broken. 무한이면 무동작(null).
//   파손되면 깬 펫(breakerPetId, 선택) 맥락으로 라이브 파손 만담 1줄 생성해 반환.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { breakerPetId?: number };

  const inst = await roomItemsRepo.getOne(user.id, id);
  if (!inst) return Response.json({ error: "없는 아이템" }, { status: 404 });
  const worn = await roomItemsRepo.wear(user.id, id);

  let breakLine: string | null = null;
  let ownerPetId: number | null = null;
  if (worn?.broke) {
    const breakerId = Number(body.breakerPetId);
    const breaker = Number.isInteger(breakerId) ? await petsRepo.getOne(user.id, breakerId) : null;
    const asset = await itemsRepo.getOne(user.id, inst.assetId);
    if (breaker && asset) {
      const ctx = inst.ownerPetId === breaker.id ? "self" : inst.ownerPetId != null ? "other" : "solo";
      ownerPetId = ctx === "other" ? inst.ownerPetId : null;
      const ownerName =
        ctx === "other" && inst.ownerPetId != null
          ? (await petsRepo.getOne(user.id, inst.ownerPetId))?.name ?? undefined
          : undefined;
      breakLine = await breakageLine(
        user.id,
        { name: asset.name },
        { name: breaker.name, personality: breaker.personality },
        ctx,
        ownerName,
      );
    }
  }

  return Response.json({
    ok: true,
    durabilityNow: worn?.now ?? null,
    broke: worn?.broke ?? false,
    breakLine,
    ownerPetId,
  });
}
