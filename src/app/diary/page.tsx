import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import * as settingsRepo from "@/db/repo/settings";
import * as diaryRepo from "@/db/repo/diary";
import DiaryView, { type DiaryEntry } from "@/components/DiaryView";

export const dynamic = "force-dynamic";

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
// today(YYYY-MM-DD) 기준 n일 전 날짜 문자열.
function daysBefore(today: string, n: number): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const user = await requireUser();
  const s = await settingsRepo.getByUser(user.id);
  const today = todayInTz(s?.timezone ?? "Asia/Seoul");
  const conn = await getLlmConfig(user.id);

  // 검색 등에서 ?focus=YYYY-MM-DD 로 들어오면 그 날 일기를 강조·스크롤.
  const focusRaw = (await searchParams)?.focus;
  const focusDate = focusRaw && /^\d{4}-\d{2}-\d{2}$/.test(focusRaw) ? focusRaw : null;

  // 기본 노출은 '오늘 + 지난 7일'만. 그 이전은 DiaryView 의 검색/필터(=/api/diary/list)로 펼친다.
  const weekAgo = daysBefore(today, 7);
  const rows = await diaryRepo.search(user.id, { from: weekAgo, to: today, limit: 50 });
  const list = [...rows.rows];

  // 포커스 날짜가 기본 창(최근 7일) 밖이면 그 한 건만 추가로 끌어와 합친다.
  if (focusDate && !list.some((e) => e.entryDate === focusDate)) {
    const one = await diaryRepo.getByDate(user.id, focusDate);
    if (one) list.push(one);
  }

  const itemsMap = await diaryRepo.getItemsForEntries(list.map((r) => r.id));
  const entries: DiaryEntry[] = list.map((e) => ({
    id: e.id,
    entryDate: e.entryDate,
    mood: (e.mood as DiaryEntry["mood"]) ?? null,
    body: e.body,
    photoPath: e.photoPath ?? null,
    aiReply: e.aiReply,
    aiPersona: e.aiPersona,
    items: (itemsMap.get(e.id) ?? []).map((it) => ({
      id: it.id,
      label: it.label,
      amount: it.amount,
      weight: it.weight,
    })),
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">일기</h1>
      </div>
      <DiaryView
        today={today}
        initialEntries={entries}
        mainSupportsVision={conn.supportsVision}
        focusDate={focusDate}
      />
    </main>
  );
}
