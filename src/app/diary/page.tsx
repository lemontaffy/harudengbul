import NavMenu from "@/components/NavMenu";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import * as settingsRepo from "@/db/repo/settings";
import * as diaryRepo from "@/db/repo/diary";
import DiaryView, { type DiaryEntry } from "@/components/DiaryView";

export const dynamic = "force-dynamic";

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export default async function DiaryPage() {
  const user = await requireUser();
  const s = await settingsRepo.getByUser(user.id);
  const today = todayInTz(s?.timezone ?? "Asia/Seoul");
  const conn = await getLlmConfig(user.id);

  const rows = await diaryRepo.listByUser(user.id);
  const entries: DiaryEntry[] = await Promise.all(
    rows.map(async (e) => ({
      id: e.id,
      entryDate: e.entryDate,
      mood: (e.mood as DiaryEntry["mood"]) ?? null,
      body: e.body,
      photoPath: e.photoPath ?? null,
      aiReply: e.aiReply,
      aiPersona: e.aiPersona,
      items: (await diaryRepo.getItems(e.id)).map((it) => ({
        id: it.id,
        label: it.label,
        amount: it.amount,
        weight: it.weight,
      })),
    })),
  );

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">일기</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </div>
      <DiaryView
        today={today}
        initialEntries={entries}
        mainSupportsVision={conn.supportsVision}
      />
    </main>
  );
}
