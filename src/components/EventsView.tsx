"use client";

import { useState } from "react";

export interface EventItem {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string | null;
  alarmMinutesBefore: number | null;
}

const ALARM_OPTIONS: { label: string; value: number | null }[] = [
  { label: "없음", value: null },
  { label: "10분 전", value: 10 },
  { label: "30분 전", value: 30 },
  { label: "1시간 전", value: 60 },
  { label: "1일 전", value: 1440 },
];

const inputCls =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

// ISO instant ↔ <input type="datetime-local"> (브라우저 로컬 기준)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString(); // 브라우저 로컬 → 절대 시각(UTC)
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

export default function EventsView({ initial }: { initial: EventItem[] }) {
  const [events, setEvents] = useState<EventItem[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  async function refresh() {
    const res = await fetch("/api/events");
    if (res.ok) setEvents((await res.json()).events);
  }

  async function remove(ev: EventItem) {
    if (!confirm(`'${ev.title}' 일정을 삭제할까요?`)) return;
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
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-60">{status}</span>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black"
          >
            + 일정 추가
          </button>
        )}
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

      {groups.length === 0 && !adding && (
        <p className="py-8 text-center text-sm opacity-40">예정된 일정이 없어요.</p>
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
                  className="flex items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-white/10"
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
                    className="rounded-lg bg-bg px-3 py-1.5 text-xs ring-1 ring-white/10"
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
    initial ? toLocalInput(initial.startsAt) : "",
  );
  const [endsAt, setEndsAt] = useState(
    initial?.endsAt ? toLocalInput(initial.endsAt) : "",
  );
  const [alarm, setAlarm] = useState<number | null>(
    initial?.alarmMinutesBefore ?? null,
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
    <div className="rounded-xl bg-surface p-4 ring-1 ring-white/10">
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
      <label className="mb-1 mt-3 block text-xs opacity-60">알람</label>
      <select
        value={alarm ?? ""}
        onChange={(e) =>
          setAlarm(e.target.value === "" ? null : Number(e.target.value))
        }
        className={inputCls}
      >
        {ALARM_OPTIONS.map((o) => (
          <option key={o.label} value={o.value ?? ""}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] opacity-40">알람은 알림(웹푸시)을 켠 기기로 와요.</p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm opacity-60 ring-1 ring-white/10"
        >
          취소
        </button>
      </div>
    </div>
  );
}
