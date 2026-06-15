import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as spritesRepo from "@/db/repo/petSprites";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import RoomListView, { type RoomCard } from "@/components/pets/RoomListView";

export const dynamic = "force-dynamic";

export default async function PetsPage() {
  const user = await requireUser();
  const [rooms, allPets, memberships] = await Promise.all([
    roomsRepo.listByUser(user.id),
    petsRepo.listByUser(user.id),
    membershipsRepo.listAllForUser(user.id), // 다대다(petId×roomId)
  ]);
  const petsByRoom = new Map<number, Set<number>>();
  const petsWithRoom = new Set<number>();
  for (const m of memberships) {
    if (!petsByRoom.has(m.roomId)) petsByRoom.set(m.roomId, new Set());
    petsByRoom.get(m.roomId)!.add(m.petId);
    petsWithRoom.add(m.petId);
  }
  const petById = new Map(allPets.map((p) => [p.id, p]));

  const cards: RoomCard[] = await Promise.all(
    rooms.map(async (r) => {
      const inRoom = [...(petsByRoom.get(r.id) ?? [])].map((id) => petById.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
      const sprites = await spritesRepo.listForRoom(user.id, r.id);
      const avatars = inRoom.map((p) => {
        const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
        const display = displayStageFor(growth, p.displayStage, reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold));
        return pickSpritePath(sprites.filter((s) => s.petId === p.id), display, "idle");
      });
      return { id: r.id, name: r.name, petCount: inRoom.length, avatars };
    }),
  );

  const waitingCount = allPets.filter((p) => !petsWithRoom.has(p.id)).length; // 어느 방에도 없는 펫

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">펫 룸</h1>
      </div>
      <RoomListView rooms={cards} waitingCount={waitingCount} />
    </main>
  );
}
