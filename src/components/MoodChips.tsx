"use client";

import { useState } from "react";

type Mood = "storm" | "rain" | "cloud" | "haze" | "sun";

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: "storm", emoji: "🌩️", label: "폭풍" },
  { key: "rain", emoji: "🌧️", label: "비" },
  { key: "cloud", emoji: "☁️", label: "흐림" },
  { key: "haze", emoji: "🌤️", label: "옅은 해" },
  { key: "sun", emoji: "☀️", label: "맑음" },
];

// 오늘 기분만 빠르게 기록. 일기 본문은 건드리지 않음(/api/diary 부분 upsert).
export default function MoodChips({
  today,
  initialMood,
}: {
  today: string;
  initialMood: Mood | null;
}) {
  const [mood, setMood] = useState<Mood | null>(initialMood);
  const [saving, setSaving] = useState(false);

  async function pick(m: Mood) {
    const next = mood === m ? null : m;
    setMood(next);
    setSaving(true);
    try {
      await fetch("/api/diary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, mood: next }),
      });
    } catch {
      /* 무시 — 다음 탭에서 재시도 */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">오늘 기분</h2>
        {saving && <span className="text-[11px] opacity-40">저장 중…</span>}
      </div>
      <div className="flex gap-2">
        {MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => pick(m.key)}
            className={`flex flex-1 flex-col items-center rounded-lg py-2 text-xs ${
              mood === m.key ? "bg-accent text-black" : "bg-bg ring-1 ring-white/10"
            }`}
            title={m.label}
          >
            <span className="text-base">{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
