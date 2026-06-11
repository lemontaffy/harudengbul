"use client";

import { useState } from "react";

type Mood = "storm" | "rain" | "cloud" | "haze" | "sun";
interface DiaryItem {
  id?: number;
  label: string;
  amount?: string | null;
  weight?: number | null;
}
export interface DiaryEntry {
  id: number;
  entryDate: string;
  mood: Mood | null;
  body: string | null;
  aiReply: string | null;
  aiPersona: string | null;
  items: DiaryItem[];
}

const MOODS: { key: Mood; emoji: string; label: string; color: string }[] = [
  { key: "storm", emoji: "🌩️", label: "폭풍", color: "#6366f1" },
  { key: "rain", emoji: "🌧️", label: "비", color: "#3b82f6" },
  { key: "cloud", emoji: "☁️", label: "흐림", color: "#9ca3af" },
  { key: "haze", emoji: "🌤️", label: "옅은 해", color: "#fbbf24" },
  { key: "sun", emoji: "☀️", label: "맑음", color: "#f59e0b" },
];
const moodOf = (m: Mood | null) => MOODS.find((x) => x.key === m);

const inputCls =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

export default function DiaryView({
  today,
  initialEntries,
}: {
  today: string;
  initialEntries: DiaryEntry[];
}) {
  const todays = initialEntries.find((e) => e.entryDate === today) ?? null;
  const past = initialEntries.filter((e) => e.entryDate !== today);

  const [mood, setMood] = useState<Mood | null>(todays?.mood ?? null);
  const [body, setBody] = useState(todays?.body ?? "");
  const [items, setItems] = useState<DiaryItem[]>(todays?.items ?? []);
  const [reply, setReply] = useState<string | null>(todays?.aiReply ?? null);
  const [replyPersona, setReplyPersona] = useState<string | null>(
    todays?.aiPersona ?? null,
  );
  const [entries, setEntries] = useState<DiaryEntry[]>(past);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  function addItem() {
    setItems((xs) => [...xs, { label: "", amount: "", weight: 3 }]);
  }
  function setItem(i: number, patch: Partial<DiaryItem>) {
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeItem(i: number) {
    setItems((xs) => xs.filter((_, j) => j !== i));
  }

  async function save() {
    if (!body.trim() && !mood && items.length === 0) {
      setStatus("내용을 입력하세요.");
      return;
    }
    setSaving(true);
    setStatus("");
    setReply(null);
    try {
      const cleanItems = items
        .filter((it) => it.label.trim())
        .map((it) => ({
          label: it.label.trim(),
          amount: it.amount?.trim() || undefined,
          weight: it.weight ?? undefined,
        }));
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, mood, body, items: cleanItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "저장 실패");
        return;
      }
      setReply(data.reply ?? null);
      setReplyPersona(data.replyPersona ?? null);
      setStatus(
        data.reply
          ? "저장됨 ✓"
          : data.replyUnavailable
            ? "저장됨 ✓ (답장은 AI 연결 후 가능)"
            : "저장됨 ✓",
      );
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 오늘 일기 */}
      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">오늘 일기</h2>
          <span className="text-[11px] opacity-50">{today}</span>
        </div>

        {/* 기분 */}
        <label className="mb-1 block text-xs opacity-60">오늘 기분</label>
        <div className="mb-4 flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood((cur) => (cur === m.key ? null : m.key))}
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

        {/* 본문 */}
        <label className="mb-1 block text-xs opacity-60">오늘 하루</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="오늘 있었던 일, 마음에 남은 것들…"
          className={`${inputCls} resize-none`}
        />

        {/* 오늘 한 일 */}
        <div className="mb-1 mt-4 flex items-center justify-between">
          <label className="block text-xs opacity-60">오늘 한 일</label>
          <button
            type="button"
            onClick={addItem}
            className="text-[11px] text-accent"
          >
            + 항목
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={it.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
                placeholder="예: 운동"
                className={`${inputCls} flex-1`}
              />
              <input
                value={it.amount ?? ""}
                onChange={(e) => setItem(i, { amount: e.target.value })}
                placeholder="30분"
                className={`${inputCls} w-20`}
              />
              <select
                value={it.weight ?? 3}
                onChange={(e) => setItem(i, { weight: Number(e.target.value) })}
                className={`${inputCls} w-16`}
                title="체감 분량 1~5"
              >
                {[1, 2, 3, 4, 5].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="px-1 text-xs opacity-50 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장하고 답장 받기"}
          </button>
          {status && <span className="text-xs opacity-70">{status}</span>}
        </div>

        {/* 답장 */}
        {reply && (
          <div className="mt-4 rounded-xl bg-bg p-3 ring-1 ring-white/10">
            <div className="mb-1 text-[11px] text-accent">
              {replyPersona ?? "상담가"}의 답장
            </div>
            <p className="whitespace-pre-wrap text-sm">{reply}</p>
          </div>
        )}
      </section>

      {/* 지난 일기 */}
      {entries.length > 0 && (
        <section className="rounded-2xl bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">지난 일기</h2>
          <ul className="flex flex-col gap-3">
            {entries.map((e) => {
              const m = moodOf(e.mood);
              return (
                <li key={e.id} className="rounded-xl bg-bg p-3 ring-1 ring-white/10">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: m?.color ?? "#555" }}
                      title={m?.label}
                    />
                    <span className="opacity-60">{e.entryDate}</span>
                    {m && <span className="opacity-40">{m.emoji} {m.label}</span>}
                  </div>
                  {e.body && (
                    <p className="whitespace-pre-wrap text-sm opacity-90">{e.body}</p>
                  )}
                  {e.items.length > 0 && (
                    <p className="mt-1 text-[11px] opacity-50">
                      {e.items
                        .map(
                          (it) =>
                            `${it.label}${it.amount ? ` ${it.amount}` : ""}`,
                        )
                        .join(" · ")}
                    </p>
                  )}
                  {e.aiReply && (
                    <div className="mt-2 rounded-lg bg-surface/60 p-2">
                      <div className="mb-0.5 text-[11px] text-accent">
                        {e.aiPersona ?? "상담가"}
                      </div>
                      <p className="whitespace-pre-wrap text-xs opacity-80">
                        {e.aiReply}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
