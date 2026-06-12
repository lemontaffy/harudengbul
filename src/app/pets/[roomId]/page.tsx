import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as relationsRepo from "@/db/repo/petRelations";
import * as petLinesRepo from "@/db/repo/petLines";
import * as settingsRepo from "@/db/repo/settings";
import { stageFor, pickSpritePath, isLoveLabel, DEFAULT_LINES } from "@/lib/pets";
import { isSleeping } from "@/lib/growth";
import RoomView from "@/components/pets/RoomView";
import type { PetVM, RelationVM } from "@/components/pets/types";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireUser();
  const roomId = Number((await params).roomId);
  if (!Number.isInteger(roomId)) notFound();
  const room = await roomsRepo.getOne(user.id, roomId);
  if (!room) notFound();

  const [petsRows, sprites, relations, lines, settings, allRooms, allPetsRows] = await Promise.all([
    petsRepo.listByRoom(user.id, roomId),
    spritesRepo.listForRoom(user.id, roomId),
    relationsRepo.listForUser(user.id),
    petLinesRepo.listForRoom(user.id, roomId),
    settingsRepo.getByUser(user.id),
    roomsRepo.listByUser(user.id),
    petsRepo.listByUser(user.id),
  ]);

  const wasSleeping = isSleeping(settings?.lastActivityAt);

  const petVMs: PetVM[] = petsRows.map((p) => {
    const stage = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const ps = sprites.filter((s) => s.petId === p.id);
    const solo = lines.filter((l) => l.petId === p.id && l.stage === stage && l.kind === "solo").map((l) => l.content);
    const about = lines
      .filter((l) => l.petId === p.id && l.stage === stage && l.kind === "about_other" && l.aboutPetId != null)
      .map((l) => ({ aboutPetId: l.aboutPetId as number, content: l.content }));
    return {
      id: p.id,
      name: p.name,
      posX: p.posX,
      posY: p.posY,
      pixelRender: p.pixelRender,
      stage,
      spritePath: pickSpritePath(ps, stage, "idle"),
      sleepPath: pickSpritePath(ps, stage, "sleep"),
      lovePath: pickSpritePath(ps, stage, "love"),
      evolutionPending: p.lastStageSeen !== stage,
      soloLines: solo.length ? solo : DEFAULT_LINES[stage],
      aboutLines: about,
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
        room={{ id: room.id, name: room.name, backgroundPath: room.backgroundPath, pixelRenderBg: room.pixelRenderBg }}
        pets={petVMs}
        relations={relVMs}
        wasSleeping={wasSleeping}
        rooms={allRooms.map((r) => ({ id: r.id, name: r.name }))}
        allPets={allPetsRows.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
