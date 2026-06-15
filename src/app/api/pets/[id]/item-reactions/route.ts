import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as itemsRepo from "@/db/repo/items";
import * as linesRepo from "@/db/repo/itemReactionLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// durable 아이템 = item_reaction(받기 분기), consumable 식품 = eating.
const DURABLE_KINDS = ["received", "owner_recognize", "other_owner"];
const FOOD_KINDS = ["eating"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await petsRepo.getOne(user.id, id))) return Response.json({ error: "없는 펫" }, { status: 404 });
  return Response.json({ itemReactions: await linesRepo.listForPet(user.id, id) });
}

const addSchema = z.object({
  itemId: z.number().int(),
  kind: z.enum(["received", "owner_recognize", "other_owner", "eating"]),
  content: z.string().trim().min(1).max(40),
});

// 직접 추가(무제한). 아이템 소유 + kind가 그 아이템 종류와 맞아야(식품=eating / durable=받기 분기).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await petsRepo.getOne(user.id, id))) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "대사를 입력하세요." }, { status: 400 });
  const { itemId, kind, content } = parsed.data;
  const item = await itemsRepo.getOne(user.id, itemId);
  if (!item || item.kind !== "item") return Response.json({ error: "없는 아이템" }, { status: 404 });
  const allowed = item.consumable ? FOOD_KINDS : DURABLE_KINDS;
  if (!allowed.includes(kind)) return Response.json({ error: "이 아이템에 맞지 않는 반응 종류예요." }, { status: 400 });
  const row = await linesRepo.addManual(itemId, id, kind, content);
  return Response.json({ line: row });
}

const delSchema = z.object({ lineId: z.number().int() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 400 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await petsRepo.getOne(user.id, id))) return Response.json({ error: "없는 펫" }, { status: 404 });
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await linesRepo.removeOne(user.id, parsed.data.lineId);
  return Response.json({ ok: true });
}
