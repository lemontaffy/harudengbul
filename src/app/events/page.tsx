import { requireUser } from "@/lib/currentUser";
import { findSecretary } from "@/lib/cta";
import * as eventsRepo from "@/db/repo/events";
import * as personasRepo from "@/db/repo/personas";
import EventsView, { type EventItem } from "@/components/EventsView";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
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
        <h1 className="text-lg font-semibold">일정</h1>
      </div>
      <EventsView initial={initial} emptyCta={emptyCta} />
    </main>
  );
}
