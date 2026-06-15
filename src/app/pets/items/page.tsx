import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as placementsRepo from "@/db/repo/furniturePlacements";
import * as petsRepo from "@/db/repo/pets";
import ItemsLibraryView, { type LibraryItem } from "@/components/pets/ItemsLibraryView";

export const dynamic = "force-dynamic";

// 전역 아이템/가구 라이브러리 관리 — 방마다 흩어 올리는 대신 한 곳에서 관리.
export default async function ItemsLibraryPage() {
  const user = await requireUser();
  const [rows, placements, pets] = await Promise.all([
    itemsRepo.listForUser(user.id),
    placementsRepo.allForUser(user.id),
    petsRepo.listByUser(user.id),
  ]);

  const petName = new Map(pets.map((p) => [p.id, p.name]));
  // 가구별 배치된 방 묶기.
  const roomsByItem = new Map<number, { roomId: number; roomName: string }[]>();
  for (const p of placements) {
    const arr = roomsByItem.get(p.itemId) ?? [];
    arr.push({ roomId: p.roomId, roomName: p.roomName });
    roomsByItem.set(p.itemId, arr);
  }

  const items: LibraryItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as "furniture" | "item",
    spritePath: r.spritePath,
    spriteAltPath: r.spriteAltPath,
    brokenSpritePath: r.brokenSpritePath,
    pixelRender: r.pixelRender,
    ownerPetId: r.ownerPetId,
    ownerName: r.ownerPetId != null ? petName.get(r.ownerPetId) ?? null : null,
    furnitureKind: r.furnitureKind as "seat" | "fixture" | null,
    type: r.type,
    actionType: r.actionType,
    facing: (r.facing as "left" | "right") ?? "left",
    seatY: r.seatY,
    durabilityMax: r.durabilityMax,
    durabilityNow: r.durabilityNow,
    placedRooms: roomsByItem.get(r.id) ?? [],
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/pets" className="text-sm opacity-60 hover:opacity-100">
          ← 펫 룸
        </Link>
        <h1 className="font-display text-base font-semibold">아이템 · 가구</h1>
        <span className="w-12" />
      </div>
      <ItemsLibraryView
        items={items}
        pets={pets.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
