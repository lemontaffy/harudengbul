import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as bgRepo from "@/db/repo/roomBackgrounds";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as relationsRepo from "@/db/repo/petRelations";
import * as petLinesRepo from "@/db/repo/petLines";
import * as customRepo from "@/db/repo/petCustomSprites";
import * as furnitureRepo from "@/db/repo/roomFurniture";
import * as letterRepliesRepo from "@/db/repo/petLetterReplies";
import * as settingsRepo from "@/db/repo/settings";
import {
  stageFor,
  reachedStages,
  displayStageFor,
  pickSpritePath,
  pickWalkPath,
  pickSitPath,
  isLoveLabel,
  DEFAULT_LINES,
} from "@/lib/pets";
import { isSleeping } from "@/lib/growth";
import RoomView from "@/components/pets/RoomView";
import type { PetVM, RelationVM, FurnitureVM } from "@/components/pets/types";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireUser();
  const roomId = Number((await params).roomId);
  if (!Number.isInteger(roomId)) notFound();
  const room = await roomsRepo.getOne(user.id, roomId);
  if (!room) notFound();

  const [petsRows, sprites, relations, lines, customs, panels, furnitureRows, settings, allRooms, allPetsRows] =
    await Promise.all([
      petsRepo.listByRoom(user.id, roomId),
      spritesRepo.listForRoom(user.id, roomId),
      relationsRepo.listForUser(user.id),
      petLinesRepo.listForRoom(user.id, roomId),
      customRepo.listForRoom(user.id, roomId),
      bgRepo.listForRoom(user.id, roomId),
      furnitureRepo.listForRoom(user.id, roomId),
      settingsRepo.getByUser(user.id),
      roomsRepo.listByUser(user.id),
      petsRepo.listByUser(user.id),
    ]);

  // fixture 상태 active 판정. 'letters' = 안 읽은 도착 답장 1건+ → 우체통 열림 스프라이트.
  const lettersActive = (await letterRepliesRepo.countUnread(user.id)) > 0;
  const furniture: FurnitureVM[] = furnitureRows.map((f) => ({
    id: f.id,
    kind: f.kind as "seat" | "fixture",
    type: f.type,
    spritePath: f.spritePath,
    spriteAltPath: f.spriteAltPath,
    posX: f.posX,
    posY: f.posY,
    pixelRender: f.pixelRender,
    actionType: f.actionType,
    active: f.actionType === "letters" ? lettersActive : false,
  }));

  const wasSleeping = isSleeping(settings?.lastActivityAt);

  const petVMs: PetVM[] = petsRows.map((p) => {
    const growthStage = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const reached = reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const display = displayStageFor(growthStage, p.displayStage, reached);
    const ps = sprites.filter((s) => s.petId === p.id);
    // 대사·잠꼬대·love는 실제 성장 스테이지 기준(스펙), 모습만 display.
    const solo = lines
      .filter((l) => l.petId === p.id && l.stage === growthStage && l.kind === "solo")
      .map((l) => l.content);
    const wake = lines
      .filter((l) => l.petId === p.id && l.stage === growthStage && l.kind === "wake")
      .map((l) => l.content);
    const about = lines
      .filter((l) => l.petId === p.id && l.stage === growthStage && l.kind === "about_other" && l.aboutPetId != null)
      .map((l) => ({ aboutPetId: l.aboutPetId as number, content: l.content }));
    return {
      id: p.id,
      name: p.name,
      posX: p.posX,
      posY: p.posY,
      pixelRender: p.pixelRender,
      walkFacing: (p.walkFacing as "left" | "right") ?? "left",
      talkativeness: p.talkativeness,
      activeness: p.activeness,
      displayStage: display,
      locomotion: (p.locomotion as "ground" | "air") ?? "ground",
      spritePath: pickSpritePath(ps, display, "idle"),
      walkPath: pickWalkPath(ps, display), // idle 폴백 없음 — walk 슬롯 있어야 산책
      sitPath: pickSitPath(ps, display), // sit 슬롯 있어야 가구에 앉음
      sleepPath: pickSpritePath(ps, display, "sleep"),
      lovePath: pickSpritePath(ps, display, "love"),
      evolutionPending: p.lastStageSeen !== growthStage,
      soloLines: solo.length ? solo : DEFAULT_LINES[growthStage],
      wakeLines: wake,
      aboutLines: about,
      customs: customs
        .filter((c) => c.petId === p.id && c.stage === display)
        .map((c) => ({
          id: c.id,
          name: c.name,
          path: c.path,
          frequency: c.frequency as "often" | "sometimes" | "manual",
          line: c.line,
        })),
    };
  });

  const relVMs: RelationVM[] = relations.map((r) => ({
    petAId: r.petAId,
    petBId: r.petBId,
    label: r.relationLabel,
    isLove: isLoveLabel(r.relationLabel),
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/pets" className="text-sm opacity-60 hover:opacity-100">
          ← 펫 룸
        </Link>
        <h1 className="font-display text-base font-semibold">{room.name}</h1>
        <span className="w-12" />
      </div>
      <RoomView
        room={{
          id: room.id,
          name: room.name,
          liveliness: room.liveliness,
          panels: panels.map((b) => ({
            id: b.id,
            path: b.path,
            pixelRender: b.pixelRender,
            floorTopY: b.floorTopY,
            floorBottomY: b.floorBottomY,
          })),
          furniture,
        }}
        pets={petVMs}
        relations={relVMs}
        wasSleeping={wasSleeping}
        rooms={allRooms.map((r) => ({ id: r.id, name: r.name }))}
        allPets={allPetsRows.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
