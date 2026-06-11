import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";
import EventsView, { type EventItem } from "@/components/EventsView";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const rows = await eventsRepo.listFrom(user.id, from);
  const initial: EventItem[] = rows.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: (e.startsAt as Date).toISOString(),
    endsAt: e.endsAt ? (e.endsAt as Date).toISOString() : null,
    alarmMinutesBefore: e.alarmMinutesBefore,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← 홈
        </Link>
        <h1 className="text-lg font-semibold">일정</h1>
        <span className="w-8" />
      </div>
      <EventsView initial={initial} />
    </main>
  );
}
