"use client";

import { useRef, useState } from "react";

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
  photoPath: string | null;
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
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function DiaryView({
  today,
  initialEntries,
  mainSupportsVision,
}: {
  today: string;
  initialEntries: DiaryEntry[];
  mainSupportsVision: boolean;
}) {
  const todays = initialEntries.find((e) => e.entryDate === today) ?? null;
  const past = initialEntries.filter((e) => e.entryDate !== today);

  const [mood, setMood] = useState<Mood | null>(todays?.mood ?? null);
  const [body, setBody] = useState(todays?.body ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(todays?.photoPath ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
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

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setStatus("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("date", today);
      const res = await fetch("/api/diary/photo", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setPhotoPath(data.photoPath);
      else setStatus(data.error ?? "사진 업로드 실패");
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function removePhoto() {
    await fetch(`/api/diary/photo?date=${today}`, { method: "DELETE" });
    setPhotoPath(null);
  }

  async function save() {
    if (!body.trim() && !mood && items.length === 0 && !photoPath) {
      setStatus("사진 한 장이나 한 줄이면 충분해요.");
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
      <section className="rounded-card bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">오늘 일기</h2>
          <span className="text-[11px] opacity-50">{today}</span>
        </div>

        {/* 한 줄+사진 모드 — 낮은 문턱 폴백 */}
        <div className="mb-4 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
          <p className="mb-2 text-[11px] opacity-60">
            글 쓸 힘이 없는 날엔, 사진 한 장 + 한 줄이면 그날 일기로 충분해요.
          </p>
          {!mainSupportsVision && (
            <p className="mb-2 rounded-control bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300/90">
              ⚠️ 지금 메인 모델은 사진을 읽지 못해요(예: DeepSeek). 사진은 기록으로
              저장되지만, 답장·주간 편지엔 사진 내용이 빠져요. 사진을 읽히려면 설정 →
              AI 연결에서 ‘이미지 인식(비전) 지원’을 켠 모델을 메인으로 쓰세요.
            </p>
          )}
          {photoPath ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPath} alt="오늘 사진" className="max-h-60 w-full rounded-control object-cover" />
              <button
                type="button"
                onClick={removePhoto}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"
              >
                사진 제거
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-full rounded-control border border-dashed border-border py-3 text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              {uploadingPhoto ? "올리는 중…" : "📷 사진 추가"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onPickPhoto}
          />
        </div>

        {/* 기분 */}
        <label className="mb-1 block text-xs opacity-60">오늘 기분</label>
        <div className="mb-4 flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood((cur) => (cur === m.key ? null : m.key))}
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

        {/* 본문 */}
        {entries.length === 0 && !todays && (
          <button
            type="button"
            onClick={() => bodyRef.current?.focus()}
            className="mb-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-left text-xs text-accent ring-1 ring-border hover:text-accent"
          >
            <span>오늘은 한 줄이면 충분해요. 지금 써볼까요?</span>
            <span aria-hidden>→</span>
          </button>
        )}

        <label className="mb-1 block text-xs opacity-60">오늘 하루 (한 줄도 괜찮아요)</label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="한 줄이어도, 사진만 남겨도 괜찮아요."
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
            className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장하고 답장 받기"}
          </button>
          {status && <span className="text-xs opacity-70">{status}</span>}
        </div>

        {/* 답장 */}
        {reply && (
          <div className="mt-4 rounded-xl bg-bg p-3 ring-1 ring-border">
            <div className="mb-1 text-[11px] text-accent">
              {replyPersona ?? "상담가"}의 답장
            </div>
            <p className="whitespace-pre-wrap text-sm">{reply}</p>
          </div>
        )}
      </section>

      {/* 지난 일기 */}
      {entries.length > 0 && (
        <section className="rounded-card bg-surface p-5">
          <h2 className="font-display mb-3 text-sm font-semibold">지난 일기</h2>
          <ul className="flex flex-col gap-3">
            {entries.map((e) => {
              const m = moodOf(e.mood);
              return (
                <li key={e.id} className="rounded-xl bg-bg p-3 ring-1 ring-border">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: m?.color ?? "#555" }}
                      title={m?.label}
                    />
                    <span className="opacity-60">{e.entryDate}</span>
                    {m && <span className="opacity-40">{m.emoji} {m.label}</span>}
                  </div>
                  {e.photoPath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.photoPath}
                      alt=""
                      className="mb-1.5 max-h-52 w-full rounded-control object-cover"
                    />
                  )}
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
                    <div className="mt-2 rounded-control bg-surface-2 p-2">
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
