import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as spritesRepo from "@/db/repo/petSprites";
import * as itemsRepo from "@/db/repo/items";
import * as placementsRepo from "@/db/repo/furniturePlacements";
import * as sceneBgRepo from "@/db/repo/sceneBackgrounds";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import PetManageHub from "@/components/pets/PetManageHub";
import type { ManagePet } from "@/components/pets/PetManageView";
import type { LibraryItem } from "@/components/pets/ItemsLibraryView";
import type { SceneBg } from "@/components/pets/SceneBackgroundsView";

export const dynamic = "force-dynamic";

export default async function PetManagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [rooms, allPets, sprites, itemRows, placements, memberships] = await Promise.all([
    roomsRepo.listByUser(user.id),
    petsRepo.listByUser(user.id),
    spritesRepo.listForUser(user.id),
    itemsRepo.listForUser(user.id),
    placementsRepo.allForUser(user.id),
    membershipsRepo.listAllForUser(user.id), // 다대다 — 펫별 소속 방
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const roomNamesByPet = new Map<number, string[]>();
  for (const m of memberships) {
    const arr = roomNamesByPet.get(m.petId) ?? [];
    const nm = roomName.get(m.roomId);
    if (nm) arr.push(nm);
    roomNamesByPet.set(m.petId, arr);
  }

  const pets: ManagePet[] = allPets.map((p) => {
    const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const display = displayStageFor(
      growth,
      p.displayStage,
      reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold),
    );
    return {
      id: p.id,
      name: p.name,
      stage: display,
      avatar: pickSpritePath(sprites.filter((s) => s.petId === p.id), display, "idle"),
      roomNames: roomNamesByPet.get(p.id) ?? [],
    };
  });

  // 가구별 배치된 방 묶기(라이브러리 목록 표시·삭제 확인용).
  const roomsByItem = new Map<number, { roomId: number; roomName: string }[]>();
  for (const pl of placements) {
    const arr = roomsByItem.get(pl.itemId) ?? [];
    arr.push({ roomId: pl.roomId, roomName: pl.roomName });
    roomsByItem.set(pl.itemId, arr);
  }
  const items: LibraryItem[] = itemRows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as "furniture" | "item",
    spritePath: r.spritePath,
    spriteAltPath: r.spriteAltPath,
    brokenSpritePath: r.brokenSpritePath,
    pixelRender: r.pixelRender,
    furnitureKind: r.furnitureKind as "seat" | "fixture" | null,
    type: r.type,
    actionType: r.actionType,
    facing: (r.facing as "left" | "right") ?? "left",
    seatY: r.seatY,
    durabilityMax: r.durabilityMax,
    consumable: r.consumable,
    placedRooms: roomsByItem.get(r.id) ?? [],
  }));

  // 장면 배경(전역). 테이블 미생성(마이그 지연) 시 빈 목록으로 폴백 — 페이지 전체가 죽지 않게.
  let sceneBackgrounds: SceneBg[] = [];
  try {
    sceneBackgrounds = (await sceneBgRepo.listForUser(user.id)).map((b) => ({
      id: b.id,
      kind: b.kind as "love" | "hostile",
      path: b.path,
    }));
  } catch (e) {
    console.error("[manage] scene backgrounds skipped:", (e as Error)?.message);
  }

  const initialTab = sp.tab === "items" ? "items" : sp.tab === "scenes" ? "scenes" : "pets";

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/pets" className="text-sm opacity-60 hover:opacity-100">
          ← 펫 룸
        </Link>
        <h1 className="font-display text-base font-semibold">관리</h1>
        <span className="w-12" />
      </div>
      <PetManageHub
        pets={pets}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        allPets={allPets.map((p) => ({ id: p.id, name: p.name }))}
        items={items}
        sceneBackgrounds={sceneBackgrounds}
        initialTab={initialTab}
      />
    </main>
  );
}
