import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/petItems";
import * as petsRepo from "@/db/repo/pets";
import * as settingsRepo from "@/db/repo/settings";
import { ensureReactions, pickReaction, type ReactionKind, type ReactionFreq } from "@/lib/petItem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: ReactionKind[] = ["receive", "break", "idle"];

// 반응 대사 1줄 — (이 아이템 × 이 펫 × kind) 캐시 보장 후 랜덤 1개.
//   캐시 히트면 LLM 미호출. 설정의 빈도(항상/가끔/안 함)에 따라 생성 여부 결정.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const petId = Number(body.petId);
  const kind = body.kind as ReactionKind;
  if (!Number.isInteger(petId) || !KINDS.includes(kind))
    return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const [item, pet, settings] = await Promise.all([
    itemsRepo.getOne(user.id, id),
    petsRepo.getOne(user.id, petId),
    settingsRepo.getByUser(user.id),
  ]);
  if (!item || !pet) return Response.json({ error: "없는 아이템/펫" }, { status: 404 });

  const freq = (settings?.itemReactionFreq as ReactionFreq) ?? "sometimes";
  const pool = await ensureReactions(
    user.id,
    { id: item.id, name: item.name },
    { id: pet.id, name: pet.name, personality: pet.personality ?? null },
    kind,
    freq,
  );
  return Response.json({ content: pickReaction(pool, item.name) });
}
