import { requireUser } from "@/lib/currentUser";
import { findSecretary } from "@/lib/cta";
import * as eventsRepo from "@/db/repo/events";
import * as personasRepo from "@/db/repo/personas";
import * as settingsRepo from "@/db/repo/settings";
import { startOfTodayInTz } from "@/lib/proactive";
import EventsView, { type EventItem } from "@/components/EventsView";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser();
  const s = await settingsRepo.getByUser(user.id);
  const from = startOfTodayInTz(s?.timezone ?? "Asia/Seoul"); // 사용자 tz 오늘 0시(서버 UTC 자정 잘림 버그 회피)
  const [rows, personas] = await Promise.all([
    eventsRepo.listFrom(user.id, from),
    personasRepo.listActiveByUser(user.id),
  ]);
  const sec = findSecretary(personas);
  const emptyCta = {
    text: sec.exists
      ? `${sec.name}에게 말해서 등록해보세요`
      : "비서 캐릭터를 만들어 일정을 맡겨보세요",
    href: sec.href,
  };
  const initial: EventItem[] = rows.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: (e.startsAt as Date).toISOString(),
    endsAt: e.endsAt ? (e.endsAt as Date).toISOString() : null,
    alarmMinutesBefore: e.alarmMinutesBefore,
    alarmKeepMinutes: e.alarmKeepMinutes,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">일정</h1>
      </div>
      <EventsView initial={initial} emptyCta={emptyCta} />
    </main>
  );
}
