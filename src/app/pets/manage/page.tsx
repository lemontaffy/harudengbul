import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import PetManageView, { type ManagePet } from "@/components/pets/PetManageView";

export const dynamic = "force-dynamic";

export default async function PetManagePage() {
  const user = await requireUser();
  const [rooms, allPets, sprites] = await Promise.all([
    roomsRepo.listByUser(user.id),
    petsRepo.listByUser(user.id),
    spritesRepo.listForUser(user.id),
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

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
      roomId: p.roomId,
      roomName: p.roomId != null ? roomName.get(p.roomId) ?? null : null,
    };
  });

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/pets" className="text-sm opacity-60 hover:opacity-100">
          ← 펫 룸
        </Link>
        <h1 className="font-display text-base font-semibold">펫 관리</h1>
        <span className="w-12" />
      </div>
      <PetManageView
        pets={pets}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        allPets={allPets.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
