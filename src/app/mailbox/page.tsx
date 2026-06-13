import { requireUser } from "@/lib/currentUser";
import * as repliesRepo from "@/db/repo/petLetterReplies";
import * as lettersRepo from "@/db/repo/petLetters";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as settingsRepo from "@/db/repo/settings";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import MailboxView, { type ReplyItem } from "@/components/MailboxView";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const user = await requireUser();
  const [replies, allPets, sprites, settings] = await Promise.all([
    repliesRepo.listForUser(user.id),
    petsRepo.listByUser(user.id),
    spritesRepo.listForUser(user.id),
    settingsRepo.getByUser(user.id),
  ]);
  const tz = settings?.timezone ?? "Asia/Seoul";
  const perDay = settings?.lettersPerDay ?? 1;
  const sentToday = await lettersRepo.countToday(user.id, tz);

  const avatarOf = new Map<number, string | null>();
  for (const p of allPets) {
    const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const display = displayStageFor(growth, p.displayStage, reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold));
    avatarOf.set(p.id, pickSpritePath(sprites.filter((s) => s.petId === p.id), display, "idle"));
  }

  const items: ReplyItem[] = replies.map((r) => ({
    id: r.id,
    petName: r.petName ?? "펫",
    avatar: avatarOf.get(r.petId) ?? null,
    content: r.content,
    letterContent: r.letterContent,
    read: r.readAt != null,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 font-display text-lg font-semibold">우체통</h1>
      <MailboxView
        replies={items}
        pets={allPets.map((p) => ({ id: p.id, name: p.name }))}
        canSend={sentToday < perDay}
        perDay={perDay}
      />
    </main>
  );
}
