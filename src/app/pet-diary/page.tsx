import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as diariesRepo from "@/db/repo/petDiaries";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as settingsRepo from "@/db/repo/settings";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import { diaryDateInTz } from "@/lib/petDiary";
import PetDiaryView, { type DiaryEntry } from "@/components/PetDiaryView";

export const dynamic = "force-dynamic";

export default async function PetDiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const settings = await settingsRepo.getByUser(user.id);
  const today = diaryDateInTz(settings?.timezone ?? "Asia/Seoul");
  const reqDate = (await searchParams).date;
  const date = reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate) ? reqDate : today;

  const [rows, allPets, sprites, dates] = await Promise.all([
    diariesRepo.listByDate(user.id, date),
    petsRepo.listByUser(user.id),
    spritesRepo.listForUser(user.id),
    diariesRepo.listDates(user.id),
  ]);

  const avatarOf = new Map<number, string | null>();
  for (const p of allPets) {
    const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    const display = displayStageFor(growth, p.displayStage, reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold));
    avatarOf.set(p.id, pickSpritePath(sprites.filter((s) => s.petId === p.id), display, "idle"));
  }
  const entries: DiaryEntry[] = rows.map((r) => ({
    petName: r.petName ?? "펫",
    avatar: avatarOf.get(r.petId) ?? null,
    content: r.content,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← 홈
        </Link>
        <h1 className="font-display text-base font-semibold">펫 일기</h1>
        <span className="w-8" />
      </div>
      <PetDiaryView
        date={date}
        today={today}
        isToday={date === today}
        entries={entries}
        dates={dates}
        hasPets={allPets.length > 0}
      />
    </main>
  );
}
