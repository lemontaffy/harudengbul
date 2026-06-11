"use client";

import { useState } from "react";

export interface HandoffItem {
  id: number;
  suggestedText: string;
  personaName: string | null;
}

const inputCls =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

const ALARM_OPTIONS: { label: string; value: number | null }[] = [
  { label: "알람 없음", value: null },
  { label: "10분 전", value: 10 },
  { label: "30분 전", value: 30 },
  { label: "1시간 전", value: 60 },
  { label: "1일 전", value: 1440 },
];

function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

// pending 핸드오프 카드. 빨간 뱃지·긴급 표시 없음 — 카드 하나가 전부.
export default function HandoffCard({ initial }: { initial: HandoffItem[] }) {
  const [items, setItems] = useState<HandoffItem[]>(initial);
  const [open, setOpen] = useState(false);
  // 등록 폼이 열린 항목 id + 제목 편집 가능 여부
  const [form, setForm] = useState<{ id: number; editable: boolean } | null>(null);

  if (items.length === 0) return null;
  const who = items[0]?.personaName?.trim() || "캐릭터";

  function remove(id: number) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setForm((f) => (f?.id === id ? null : f));
  }

  async function dismiss(id: number) {
    const res = await fetch(`/api/handoffs/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 409) remove(id);
  }

  return (
    <section className="rounded-2xl bg-surface p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm">
          <span className="font-medium">{who}</span>가 전달한 항목{" "}
          <span className="text-accent">{items.length}건</span>
        </span>
        <span className="text-xs opacity-40">{open ? "접기" : "보기"}</span>
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-bg p-3 ring-1 ring-white/10">
              <div className="text-sm">{it.suggestedText}</div>
              {form?.id === it.id ? (
                <RegisterForm
                  item={it}
                  editable={form.editable}
                  onCancel={() => setForm(null)}
                  onDone={() => remove(it.id)}
                />
              ) : (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => setForm({ id: it.id, editable: false })}
                    className="rounded-lg bg-accent px-3 py-1.5 font-medium text-black"
                  >
                    등록
                  </button>
                  <button
                    onClick={() => setForm({ id: it.id, editable: true })}
                    className="rounded-lg bg-surface px-3 py-1.5 ring-1 ring-white/10"
                  >
                    수정 후 등록
                  </button>
                  <button
                    onClick={() => dismiss(it.id)}
                    className="rounded-lg px-3 py-1.5 opacity-60 hover:text-red-400"
                  >
                    넘기기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RegisterForm({
  item,
  editable,
  onCancel,
  onDone,
}: {
  item: HandoffItem;
  editable: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(item.suggestedText);
  const [startsAt, setStartsAt] = useState("");
  const [alarm, setAlarm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!title.trim() || !startsAt) {
      setErr("제목과 시작 일시를 입력하세요.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/handoffs/${item.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startsAt: fromLocalInput(startsAt),
          alarmMinutesBefore: alarm,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "등록 실패");
        return;
      }
      onDone();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        readOnly={!editable}
        maxLength={120}
        className={`${inputCls} ${!editable ? "opacity-70" : ""}`}
      />
      <label className="text-xs opacity-60">
        시작 일시
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={`${inputCls} mt-1`}
        />
      </label>
      <select
        value={alarm ?? ""}
        onChange={(e) => setAlarm(e.target.value === "" ? null : Number(e.target.value))}
        className={inputCls}
      >
        {ALARM_OPTIONS.map((o) => (
          <option key={o.label} value={o.value ?? ""}>
            {o.label}
          </option>
        ))}
      </select>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "등록 중…" : "일정 등록"}
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
