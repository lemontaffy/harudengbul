"use client";

import { useState } from "react";

export interface DiaryReminderInitial {
  enabled: boolean;
  time: string;
  personaId: number | null;
}

const input =
  "rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function DiaryReminderSection({
  initial,
  counselors,
}: {
  initial: DiaryReminderInitial;
  counselors: { id: number; name: string }[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [time, setTime] = useState(initial.time.slice(0, 5));
  const [personaId, setPersonaId] = useState<number | null>(
    initial.personaId ?? counselors[0]?.id ?? null,
  );
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    const body: Record<string, unknown> = {
      diaryReminderEnabled: enabled,
      diaryReminderTime: time,
    };
    if (personaId != null) body.diaryReminderPersonaId = personaId;
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok ? "저장됨 ✓" : (data.error ?? "저장 실패"));
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">일기 리마인드</h2>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={`h-6 w-11 rounded-full transition ${enabled ? "bg-accent" : "bg-border"}`}
        >
          <span
            className={`block h-5 w-5 rounded-full bg-white transition ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <p className="mb-3 text-[11px] opacity-50">
        설정한 시간에 일기를 안 썼으면, 담당 캐릭터가 부담 없이 한 번 물어봐요. 그날 이미
        기분/일기를 남겼으면 보내지 않아요.
      </p>

      <div className="flex gap-3">
        <label className="text-xs opacity-60">
          시간
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`${input} mt-1 block`}
          />
        </label>
        <label className="flex-1 text-xs opacity-60">
          보내는 캐릭터
          {counselors.length === 0 ? (
            <p className="mt-1 text-[11px] text-red-400">상담가 캐릭터가 필요해요.</p>
          ) : (
            <select
              value={personaId ?? ""}
              onChange={(e) => setPersonaId(Number(e.target.value))}
              className={`${input} mt-1 block w-full`}
            >
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {status && <span className="text-xs opacity-70">{status}</span>}
      </div>
    </section>
  );
}
