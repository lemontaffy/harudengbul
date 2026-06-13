import { requireUser } from "@/lib/currentUser";
import * as repliesRepo from "@/db/repo/petLetterReplies";
import * as lettersRepo from "@/db/repo/petLetters";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as settingsRepo from "@/db/repo/settings";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import MailboxView, { type LetterCard, type CardReply } from "@/components/MailboxView";

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

  // 편지(letter_id)별 합본 카드로 묶음. 답장 row 는 그대로 — 표시만 그룹화.
  // 전원 발송(toPetId null)은 여러 답장이 한 카드에, 개별 발송은 단일 답장 카드.
  const byLetter = new Map<number, LetterCard>();
  for (const r of replies) {
    let card = byLetter.get(r.letterId);
    if (!card) {
      card = {
        letterId: r.letterId,
        toAll: r.toPetId == null,
        letterContent: r.letterContent,
        sentAt: (r.sentAt ?? new Date()).toISOString(),
        replies: [],
      };
      byLetter.set(r.letterId, card);
    }
    const reply: CardReply = {
      id: r.id,
      petName: r.petName ?? "펫",
      avatar: avatarOf.get(r.petId) ?? null,
      arrived: r.status === "arrived",
      content: r.content,
      read: r.readAt != null,
    };
    card.replies.push(reply);
  }
  const cards = [...byLetter.values()]; // listForUser 가 이미 sentAt desc · deliverAt asc 정렬

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 font-display text-lg font-semibold">우체통</h1>
      <MailboxView
        cards={cards}
        pets={allPets.map((p) => ({ id: p.id, name: p.name }))}
        canSend={sentToday < perDay}
        perDay={perDay}
      />
    </main>
  );
}
