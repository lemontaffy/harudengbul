"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/components/ui/Dialog";

export interface EventItem {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string | null;
  alarmMinutesBefore: number | null;
  alarmKeepMinutes: number | null;
}

const ALARM_OPTIONS: { label: string; value: number | null }[] = [
  { label: "없음", value: null },
  { label: "10분 전", value: 10 },
  { label: "30분 전", value: 30 },
  { label: "1시간 전", value: 60 },
  { label: "1일 전", value: 1440 },
];

// 알람 유지(반복) 시간 프리셋
const KEEP_OPTIONS: { label: string; value: number | null }[] = [
  { label: "반복 없음", value: null },
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
  { label: "3시간", value: 180 },
];

const inputCls =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// ISO instant ↔ <input type="datetime-local"> (브라우저 로컬 기준)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString(); // 브라우저 로컬 → 절대 시각(UTC)
}
// 추가 시 기본 시작값 = 다음 정시(분/초 0). 예: 12:10 → 13:00
function nextHourLocalInput(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function EventsView({
  initial,
  emptyCta,
}: {
  initial: EventItem[];
  emptyCta?: { text: string; href: string };
}) {
  const dialog = useDialog();
  const [events, setEvents] = useState<EventItem[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list"); // 기본=리스트(다가오는 것 중심)
  const [dataVersion, setDataVersion] = useState(0); // 변경 시 캘린더 재조회 트리거

  async function refresh() {
    const res = await fetch("/api/events");
    if (res.ok) setEvents((await res.json()).events);
    setDataVersion((v) => v + 1);
  }

  // 마운트 + 화면 복귀(PWA 백그라운드 복귀·탭 전환·포커스) 시 최신화.
  //   비서(테오)가 채팅 화면에서 서버측으로 등록한 일정은 이 화면의 SSR 시점 이후 생기므로,
  //   재요청 없이는 stale 로 남아 "등록했다는데 안 보인다" 가 된다. 자동 자가복구.
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(ev: EventItem) {
    if (!(await dialog.confirm({ message: `'${ev.title}' 일정을 삭제할까요?`, danger: true, confirmText: "삭제" }))) return;
    const res = await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
    if (res.ok) {
      setStatus("삭제됨");
      await refresh();
    } else setStatus("삭제 실패");
  }

  // 날짜별 그룹
  const groups: { key: string; items: EventItem[] }[] = [];
  for (const e of events) {
    const k = dayKey(e.startsAt);
    const g = groups.find((x) => x.key === k);
    if (g) g.items.push(e);
    else groups.push({ key: k, items: [e] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 text-xs">
          {([
            ["list", "리스트"],
            ["calendar", "캘린더"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-control px-3 py-1.5 ${view === v ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">{status}</span>
          {!adding && (
            <button
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
              className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-black"
            >
              + 일정 추가
            </button>
          )}
        </div>
      </div>

      {adding && (
        <EventForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            setStatus("추가됨 ✓");
            await refresh();
          }}
          onError={setStatus}
        />
      )}

      {view === "calendar" ? (
        <CalendarView dataVersion={dataVersion} onError={setStatus} onMutated={refresh} />
      ) : (
        <>
          {groups.length === 0 && !adding && (
            emptyCta ? (
              <a
                href={emptyCta.href}
                className="flex items-center justify-center gap-1 py-8 text-center text-sm text-accent hover:text-accent"
              >
                {emptyCta.text} <span aria-hidden>→</span>
              </a>
            ) : (
              <p className="py-8 text-center text-sm opacity-40">예정된 일정이 없어요.</p>
            )
          )}

          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="mb-1 text-xs font-semibold opacity-60">{g.key}</h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((e) =>
                  editingId === e.id ? (
                    <li key={e.id}>
                      <EventForm
                        initial={e}
                        onCancel={() => setEditingId(null)}
                        onSaved={async () => {
                          setEditingId(null);
                          setStatus("저장됨 ✓");
                          await refresh();
                        }}
                        onError={setStatus}
                      />
                    </li>
                  ) : (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-border"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{e.title}</div>
                        <div className="text-[11px] opacity-50">
                          {new Date(e.startsAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {e.alarmMinutesBefore != null &&
                            ` · 알람 ${e.alarmMinutesBefore}분 전`}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setEditingId(e.id);
                          setAdding(false);
                        }}
                        className="rounded-control bg-bg px-3 py-1.5 text-xs ring-1 ring-border"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => remove(e)}
                        className="px-2 py-1.5 text-xs opacity-60 hover:text-red-400"
                      >
                        삭제
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// 월 그리드 캘린더 — 같은 이벤트 데이터를 월 범위로 조회(getBetween→listBetween 재사용).
// 일정 있는 날 점 마커(단색), 날짜 탭 → 그날 일정 패널. 모바일 우선(마커만, 텍스트는 탭 후).
function CalendarView({
  dataVersion,
  onError,
  onMutated,
}: {
  dataVersion: number;
  onError: (m: string) => void;
  onMutated: () => Promise<void> | void;
}) {
  const dialog = useDialog();
  const [cur, setCur] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [monthEvents, setMonthEvents] = useState<EventItem[]>([]);
  const [selDay, setSelDay] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null); // 패널에서 펼쳐 편집 중인 일정
  const [loading, setLoading] = useState(false);

  async function del(e: EventItem) {
    if (!(await dialog.confirm({ message: `'${e.title}' 일정을 삭제할까요?`, danger: true, confirmText: "삭제" }))) return;
    const res = await fetch(`/api/events/${e.id}`, { method: "DELETE" });
    if (res.ok) {
      if (editId === e.id) setEditId(null);
      onError("삭제됨");
      await onMutated();
    } else onError("삭제 실패");
  }

  useEffect(() => {
    const start = new Date(cur.y, cur.m, 1, 0, 0, 0, 0);
    const end = new Date(cur.y, cur.m + 1, 1, 0, 0, 0, 0);
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fail"))))
      .then((d) => {
        if (!cancelled) setMonthEvents(d.events as EventItem[]);
      })
      .catch(() => {
        if (!cancelled) onError("캘린더를 불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cur, dataVersion, onError]);

  // 날짜(1-base) → 그날 이벤트
  const byDay = new Map<number, EventItem[]>();
  for (const e of monthEvents) {
    const d = new Date(e.startsAt);
    if (d.getFullYear() === cur.y && d.getMonth() === cur.m) {
      const k = d.getDate();
      const arr = byDay.get(k);
      if (arr) arr.push(e);
      else byDay.set(k, [e]);
    }
  }

  const firstWeekday = new Date(cur.y, cur.m, 1).getDay(); // 0=일
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === cur.y && today.getMonth() === cur.m && today.getDate() === d;

  function shift(delta: number) {
    setSelDay(null);
    setEditId(null);
    setCur((c) => {
      const nm = c.m + delta;
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  }

  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const selEvents = selDay != null ? byDay.get(selDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      {/* 월 이동 */}
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="rounded-control bg-bg px-3 py-1.5 text-sm ring-1 ring-border" aria-label="이전 달">‹</button>
        <span className="text-sm font-semibold">
          {cur.y}년 {cur.m + 1}월
        </span>
        <button onClick={() => shift(1)} className="rounded-control bg-bg px-3 py-1.5 text-sm ring-1 ring-border" aria-label="다음 달">›</button>
      </div>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] opacity-50">
        {WEEK.map((w, i) => (
          <div key={w} className={i === 0 ? "text-red-400/80" : i === 6 ? "text-blue-400/80" : ""}>
            {w}
          </div>
        ))}
      </div>
      {/* 날짜 그리드 — 마커(점)만, 텍스트는 탭 후 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const has = (byDay.get(d)?.length ?? 0) > 0;
          const sel = selDay === d;
          return (
            <button
              key={i}
              onClick={() => {
                setEditId(null);
                setSelDay(sel ? null : d);
              }}
              className={`flex aspect-square flex-col items-center justify-center rounded-control text-xs ring-1 ${
                sel ? "bg-accent text-black ring-accent" : isToday(d) ? "bg-surface ring-accent" : "bg-surface ring-border"
              }`}
            >
              <span>{d}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${has ? (sel ? "bg-black/70" : "bg-accent") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      {loading && <p className="text-center text-[11px] opacity-40">불러오는 중…</p>}
      {/* 선택일 패널 — 일정 탭하면 편집 폼으로 펼쳐짐 */}
      {selDay != null && (
        <div className="rounded-card bg-surface p-3 ring-1 ring-border">
          <h3 className="mb-2 text-xs font-semibold opacity-60">
            {cur.m + 1}월 {selDay}일
          </h3>
          {selEvents.length === 0 ? (
            <p className="py-2 text-center text-xs opacity-40">이 날은 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selEvents.map((e) =>
                editId === e.id ? (
                  <li key={e.id}>
                    <EventForm
                      initial={e}
                      onCancel={() => setEditId(null)}
                      onSaved={async () => {
                        setEditId(null);
                        onError("저장됨 ✓");
                        await onMutated();
                      }}
                      onError={onError}
                    />
                  </li>
                ) : (
                  <li key={e.id} className="flex items-center gap-2 rounded-xl bg-bg p-2.5 ring-1 ring-border">
                    <button
                      onClick={() => setEditId(e.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      title="탭하면 편집"
                    >
                      <span className="shrink-0 text-[11px] tabular-nums opacity-50">
                        {new Date(e.startsAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    </button>
                    <button
                      onClick={() => del(e)}
                      className="shrink-0 px-2 py-1 text-xs opacity-60 hover:text-red-400"
                    >
                      삭제
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventForm({
  initial,
  onCancel,
  onSaved,
  onError,
}: {
  initial?: EventItem;
  onCancel: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalInput(initial.startsAt) : nextHourLocalInput(),
  );
  const [endsAt, setEndsAt] = useState(
    initial?.endsAt ? toLocalInput(initial.endsAt) : "",
  );
  const [alarm, setAlarm] = useState<number | null>(
    initial?.alarmMinutesBefore ?? null,
  );
  const [keep, setKeep] = useState<number | null>(
    initial?.alarmKeepMinutes ?? null,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !startsAt) {
      onError("제목과 시작 일시를 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        startsAt: fromLocalInput(startsAt),
        endsAt: endsAt ? fromLocalInput(endsAt) : null,
        alarmMinutesBefore: alarm,
        alarmKeepMinutes: keep,
      };
      const res = await fetch(
        initial ? `/api/events/${initial.id}` : "/api/events",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error ?? "저장 실패");
        return;
      }
      onSaved();
    } catch {
      onError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
      <label className="mb-1 block text-xs opacity-60">제목</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="예: 치과 예약"
        className={inputCls}
      />
      <div className="mt-3 flex gap-2">
        <label className="flex-1 text-xs opacity-60">
          시작
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="flex-1 text-xs opacity-60">
          종료(선택)
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
      <label className="mb-1 mt-3 block text-xs opacity-60">알람 (몇 분 전)</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={10080}
          step={1}
          inputMode="numeric"
          value={alarm ?? ""}
          onChange={(e) =>
            setAlarm(
              e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))),
            )
          }
          placeholder="없음"
          className={`${inputCls} flex-1`}
        />
        <span className="shrink-0 text-xs opacity-50">분 전</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALARM_OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setAlarm(o.value)}
            className={`rounded-control px-2.5 py-1 text-[11px] ${
              (o.value ?? null) === (alarm ?? null)
                ? "bg-accent text-black"
                : "bg-bg ring-1 ring-border"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] opacity-40">
        직접 입력하거나 칩을 누르세요. 알람은 알림(웹푸시)을 켠 기기로 와요.
      </p>

      <label className="mb-1 mt-3 block text-xs opacity-60">
        알람 유지(반복) — 확인할 때까지
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={1440}
          step={1}
          inputMode="numeric"
          value={keep ?? ""}
          onChange={(e) =>
            setKeep(
              e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))),
            )
          }
          placeholder="반복 없음"
          className={`${inputCls} flex-1`}
        />
        <span className="shrink-0 text-xs opacity-50">분 동안</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {KEEP_OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setKeep(o.value)}
            className={`rounded-control px-2.5 py-1 text-[11px] ${
              (o.value ?? null) === (keep ?? null)
                ? "bg-accent text-black"
                : "bg-bg ring-1 ring-border"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] opacity-40">
        설정하면 알림을 확인(탭)할 때까지 그 시간 동안 5분 간격으로 다시 알려줘요.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border"
        >
          취소
        </button>
      </div>
    </div>
  );
}
