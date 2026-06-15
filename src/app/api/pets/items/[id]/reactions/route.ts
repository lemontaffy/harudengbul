import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import * as linesRepo from "@/db/repo/itemReactionLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["received", "owner_recognize", "other_owner"];

// 이 (아이템×펫) 반응 풀 — 열람/추가/삭제(기존 lines 편집과 동일 권한). 시트에서 사용.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const itemId = Number((await params).id);
  const petId = Number(new URL(req.url).searchParams.get("petId"));
  if (!Number.isInteger(itemId) || !Number.isInteger(petId))
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await itemsRepo.getOne(user.id, itemId))) return Response.json({ error: "없는 아이템" }, { status: 404 });
  return Response.json({ lines: await linesRepo.listForPair(user.id, itemId, petId) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const itemId = Number((await params).id);
  if (!Number.isInteger(itemId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { petId?: number; kind?: string; content?: string };
  const petId = Number(body.petId);
  const kind = String(body.kind ?? "");
  const content = String(body.content ?? "").trim().slice(0, 40);
  if (!Number.isInteger(petId) || !KINDS.includes(kind) || !content)
    return Response.json({ error: "입력을 확인하세요." }, { status: 400 });
  // 소유 검증(아이템·펫 모두 본인).
  if (!(await itemsRepo.getOne(user.id, itemId)) || !(await petsRepo.getOne(user.id, petId)))
    return Response.json({ error: "없는 대상" }, { status: 404 });
  const row = await linesRepo.addManual(itemId, petId, kind, content);
  return Response.json({ ok: true, line: row });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const lineId = Number(new URL(req.url).searchParams.get("lineId"));
  if (!Number.isInteger(lineId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await linesRepo.removeOne(user.id, lineId);
  return Response.json({ ok: true });
}
