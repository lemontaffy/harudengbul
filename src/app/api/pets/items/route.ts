import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import { saveSprite, SpriteError } from "@/lib/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["letters", "memo", "diary", "pet_diary", "achievements", "none"];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const kindRaw = new URL(req.url).searchParams.get("kind");
  const kind = kindRaw === "furniture" || kindRaw === "item" ? kindRaw : undefined;
  return Response.json({ items: await itemsRepo.listForUser(user.id, kind) });
}

// 라이브러리에 추가 — 스프라이트 업로드 + kind(furniture|item) + 메타.
//   가구: furnitureKind(seat/fixture), (fixture면)action, altFile(active).
//   아이템: ownerPetId(선택), brokenFile(파손), durability.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kindRaw = String(form?.get("kind") ?? "");
  const name = String(form?.get("name") ?? "").trim();
  const pixel = form?.get("pixelRender");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (kindRaw !== "furniture" && kindRaw !== "item")
    return Response.json({ error: "종류(가구/아이템)를 고르세요." }, { status: 400 });
  if (!name) return Response.json({ error: "이름을 입력하세요." }, { status: 400 });

  // 소유 펫(선택) — 본인 펫인지 검증.
  let ownerPetId: number | null = null;
  const ownerRaw = form?.get("ownerPetId");
  if (ownerRaw != null && String(ownerRaw) !== "") {
    const pid = Number(ownerRaw);
    if (!Number.isInteger(pid) || !(await petsRepo.getOne(user.id, pid)))
      return Response.json({ error: "없는 펫" }, { status: 400 });
    ownerPetId = pid;
  }

  try {
    const pixelRender = pixel == null ? true : pixel === "true";
    if (kindRaw === "furniture") {
      const fkRaw = String(form?.get("furnitureKind") ?? "");
      if (fkRaw !== "seat" && fkRaw !== "fixture")
        return Response.json({ error: "가구 유형(seat/fixture)을 고르세요." }, { status: 400 });
      const furnitureKind = fkRaw as "seat" | "fixture";
      const actionRaw = String(form?.get("actionType") ?? "");
      const actionType =
        furnitureKind === "fixture" ? (ACTIONS.includes(actionRaw) ? actionRaw : "none") : null;
      const typeRaw = String(form?.get("type") ?? "").trim();
      const facingRaw = String(form?.get("facing") ?? "");
      const seatYRaw = Number(form?.get("seatY"));
      const altFile = form?.get("altFile");

      const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
      const altPath =
        altFile instanceof File ? (await saveSprite(user.id, altFile, { allowJpeg: true })).path : null;
      const row = await itemsRepo.add(user.id, {
        name,
        kind: "furniture",
        spritePath: path,
        ownerPetId,
        pixelRender,
        furnitureKind,
        type: typeRaw || (furnitureKind === "seat" ? "seat" : actionType ?? "fixture"),
        spriteAltPath: altPath,
        actionType,
        facing: facingRaw === "right" ? "right" : facingRaw === "left" ? "left" : undefined,
        seatY: Number.isFinite(seatYRaw) ? Math.max(0, Math.min(100, seatYRaw)) : undefined,
      });
      return Response.json({ ok: true, item: row, warning });
    }

    // kind === "item"
    const brokenFile = form?.get("brokenFile");
    const dmaxRaw = form?.get("durabilityMax");
    const durabilityMax =
      dmaxRaw != null && String(dmaxRaw) !== "" && Number.isFinite(Number(dmaxRaw))
        ? Math.max(1, Math.floor(Number(dmaxRaw)))
        : null;
    const { path, warning } = await saveSprite(user.id, file, { allowJpeg: true });
    const brokenPath =
      brokenFile instanceof File ? (await saveSprite(user.id, brokenFile, { allowJpeg: true })).path : null;
    const row = await itemsRepo.add(user.id, {
      name,
      kind: "item",
      spritePath: path,
      ownerPetId,
      pixelRender,
      brokenSpritePath: brokenPath,
      durabilityMax,
      durabilityNow: durabilityMax ?? 0,
    });
    return Response.json({ ok: true, item: row, warning });
  } catch (err) {
    if (err instanceof SpriteError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[items] 추가 실패:", (err as Error)?.message);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
