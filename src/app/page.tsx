import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as eventsRepo from "@/db/repo/events";
import * as diaryRepo from "@/db/repo/diary";
import * as messagesRepo from "@/db/repo/messages";
import * as handoffsRepo from "@/db/repo/handoffs";
import { phraseForDate } from "@/lib/phrases";
import NavMenu from "@/components/NavMenu";
import ConnectionSwitcher from "@/components/ConnectionSwitcher";
import LiveClock from "@/components/LiveClock";
import MoodChips from "@/components/MoodChips";
import WeatherSlot from "@/components/WeatherSlot";
import PhraseCard from "@/components/PhraseCard";
import HandoffCard, { type HandoffItem } from "@/components/HandoffCard";

export const dynamic = "force-dynamic";

type Mood = "storm" | "rain" | "cloud" | "haze" | "sun";
type Condition = "sick" | "tired" | "normal" | "energetic";

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
function timeLabel(d: Date | string, tz: string): string {
  return new Date(d).toLocaleTimeString("ko-KR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const s = await settingsRepo.getByUser(user.id);
  const tz = s?.timezone ?? "Asia/Seoul";
  const today = todayInTz(tz);

  // 오늘 일정 범위(서버 기준 당일)
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [personaRows, todayEvents, todayDiary, handoffRows] = await Promise.all([
    personasRepo.listActiveByUser(user.id),
    eventsRepo.getBetween(user.id, start, end),
    diaryRepo.getByDate(user.id, today),
    handoffsRepo.listPending(user.id),
  ]);
  const handoffs: HandoffItem[] = handoffRows.map((h) => ({
    id: h.id,
    suggestedText: h.suggestedText,
    personaName: h.personaName,
  }));

  const active =
    personaRows.find((p) => p.id === s?.activePersonaId) ?? personaRows[0] ?? null;
  const [lastMsg, unread] = active
    ? await Promise.all([
        messagesRepo.lastMessage(user.id, active.id),
        messagesRepo.countUnread(user.id, active.id, active.lastReadAt ?? null),
      ])
    : [null, 0];

  const phrase = phraseForDate(today);
  const personaName = active?.name?.trim() || "캐릭터";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      {/* 헤더 */}
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-accent">하루등불</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </header>

      {/* 메인 AI 연결 전환 */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="opacity-40">메인 연결</span>
        <ConnectionSwitcher />
      </div>

      {/* 시계 + 날씨 슬롯 */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-2xl bg-surface p-4">
          <LiveClock />
        </div>
        <WeatherSlot />
      </div>

      {/* 채팅 입구 카드 */}
      <Link
        href="/chat"
        className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-white/5 hover:ring-accent/40"
      >
        {active?.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.avatarPath} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="h-11 w-11 rounded-full bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{personaName}</span>
            {unread > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-black">
                {unread}
              </span>
            )}
          </div>
          <p className="truncate text-xs opacity-50">
            {lastMsg
              ? `${lastMsg.role === "user" ? "나: " : ""}${lastMsg.content}`
              : "대화를 시작해 보세요"}
          </p>
        </div>
        <span className="text-lg opacity-30">›</span>
      </Link>

      {/* 핸드오프(상담가가 전달한 항목) — pending 있을 때만 */}
      <HandoffCard initial={handoffs} />

      {/* 오늘 일정 미니 */}
      <section className="rounded-2xl bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">오늘 일정</h2>
          <Link href="/events" className="text-[11px] text-accent">전체 보기</Link>
        </div>
        {todayEvents.length === 0 ? (
          <p className="text-xs opacity-40">오늘 일정이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {todayEvents.slice(0, 3).map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs opacity-50">
                  {timeLabel(e.startsAt as Date, tz)}
                </span>
                <span className="truncate">{e.title}</span>
              </li>
            ))}
            {todayEvents.length > 3 && (
              <li className="text-[11px] opacity-40">+{todayEvents.length - 3}건 더</li>
            )}
          </ul>
        )}
      </section>

      {/* 기분 체크인 칩 */}
      <MoodChips
        today={today}
        initialMood={(todayDiary?.mood as Mood) ?? null}
        initialCondition={(todayDiary?.bodyCondition as Condition) ?? null}
      />

      {/* 한마디 카드 (정적 즉시 → 생성형 교체) */}
      <PhraseCard initial={phrase} />
    </main>
  );
}
