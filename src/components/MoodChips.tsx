"use client";

import { useState } from "react";

type Mood = "storm" | "rain" | "cloud" | "haze" | "sun";
type Condition = "sick" | "tired" | "normal" | "energetic";

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: "storm", emoji: "🌩️", label: "폭풍" },
  { key: "rain", emoji: "🌧️", label: "비" },
  { key: "cloud", emoji: "☁️", label: "흐림" },
  { key: "haze", emoji: "🌤️", label: "옅은 해" },
  { key: "sun", emoji: "☀️", label: "맑음" },
];

const CONDITIONS: { key: Condition; emoji: string; label: string }[] = [
  { key: "sick", emoji: "🤒", label: "아픔" },
  { key: "tired", emoji: "😪", label: "피곤" },
  { key: "normal", emoji: "🙂", label: "보통" },
  { key: "energetic", emoji: "💪", label: "쌩쌩" },
];

// 오늘 기분 + 몸 상태를 빠르게 기록. 본문은 안 건드림(/api/diary 부분 upsert).
export default function MoodChips({
  today,
  initialMood,
  initialCondition,
}: {
  today: string;
  initialMood: Mood | null;
  initialCondition: Condition | null;
}) {
  const [mood, setMood] = useState<Mood | null>(initialMood);
  const [condition, setCondition] = useState<Condition | null>(initialCondition);
  const [saving, setSaving] = useState(false);

  async function save(patch: { mood?: Mood | null; bodyCondition?: Condition | null }) {
    setSaving(true);
    try {
      await fetch("/api/diary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, ...patch }),
      });
    } catch {
      /* 무시 — 다음 탭에서 재시도 */
    } finally {
      setSaving(false);
    }
  }

  function pickMood(m: Mood) {
    const next = mood === m ? null : m;
    setMood(next);
    save({ mood: next });
  }
  function pickCondition(c: Condition) {
    const next = condition === c ? null : c;
    setCondition(next);
    save({ bodyCondition: next });
  }

  return (
    <div className="rounded-card bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">오늘 기분</h2>
        {saving && <span className="text-[11px] opacity-40">저장 중…</span>}
      </div>
      <div className="flex gap-2">
        {MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => pickMood(m.key)}
            className={`flex flex-1 flex-col items-center rounded-control py-2 text-xs ${
              mood === m.key ? "bg-accent text-black" : "bg-bg ring-1 ring-border"
            }`}
            title={m.label}
          >
            <span className="text-base">{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <h2 className="font-display mb-2 mt-4 text-sm font-semibold">오늘 컨디션</h2>
      <div className="flex gap-2">
        {CONDITIONS.map((c) => (
          <button
            key={c.key}
            onClick={() => pickCondition(c.key)}
            className={`flex flex-1 flex-col items-center rounded-control py-2 text-xs ${
              condition === c.key ? "bg-accent text-black" : "bg-bg ring-1 ring-border"
            }`}
            title={c.label}
          >
            <span className="text-base">{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] opacity-40">
        몸이 안 좋은 날엔 기분이 따라 내려가기도 해요. 그런 날의 기분은 캐릭터가 보정해서 봐줘요.
      </p>
    </div>
  );
}
