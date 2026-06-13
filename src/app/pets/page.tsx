import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import RoomListView, { type RoomCard } from "@/components/pets/RoomListView";

export const dynamic = "force-dynamic";

export default async function PetsPage() {
  const user = await requireUser();
  const [rooms, allPets] = await Promise.all([
    roomsRepo.listByUser(user.id),
    petsRepo.listByUser(user.id),
  ]);

  const cards: RoomCard[] = await Promise.all(
    rooms.map(async (r) => {
      const inRoom = allPets.filter((p) => p.roomId === r.id);
      const sprites = await spritesRepo.listForRoom(user.id, r.id);
      const avatars = inRoom.map((p) => {
        const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
        const display = displayStageFor(growth, p.displayStage, reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold));
        return pickSpritePath(sprites.filter((s) => s.petId === p.id), display, "idle");
      });
      return { id: r.id, name: r.name, petCount: inRoom.length, avatars };
    }),
  );

  const waitingCount = allPets.filter((p) => p.roomId == null).length; // 대기(어느 방에도 없는) 펫

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">펫 룸</h1>
      </div>
      <RoomListView rooms={cards} waitingCount={waitingCount} />
    </main>
  );
}
