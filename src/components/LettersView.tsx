"use client";

import { useState } from "react";
import Link from "next/link";
import { isReopenable } from "@/lib/timecapsule";
import GenerateLetterButton from "@/components/GenerateLetterButton";

export interface PersonaOption {
  id: number;
  name: string;
}
export interface SealedCapsule {
  id: number;
  deliverOn: string;
  createdAt: string;
  personaName: string | null;
  personaId: number | null;
  reopenable: boolean;
  content: string | null;
}
export interface ReceivedCapsule {
  id: number;
  deliverOn: string;
  deliveredAt: string;
  personaName: string | null;
  content: string;
}
export interface WeeklyLetter {
  id: number;
  weekStart: string;
  weekEnd: string;
  body: string;
  personaName: string | null;
}

const inputCls =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return ymd(d);
}
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
})();
function fmtYmd(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
function fmtIso(s: string): string {
  return new Date(s).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

const PRESETS = [
  { label: "1개월 후", value: addMonths(1) },
  { label: "6개월 후", value: addMonths(6) },
  { label: "1년 후", value: addMonths(12) },
];

export default function LettersView({
  personas,
  initialSealed,
  receivedCapsules,
  weeklyLetters,
}: {
  personas: PersonaOption[];
  initialSealed: SealedCapsule[];
  receivedCapsules: ReceivedCapsule[];
  weeklyLetters: WeeklyLetter[];
}) {
  const [sealed, setSealed] = useState<SealedCapsule[]>(initialSealed);
  const [editing, setEditing] = useState<number | null>(null);

  // 작성 폼
  const [content, setContent] = useState("");
  const [deliverOn, setDeliverOn] = useState(addMonths(1));
  const [personaId, setPersonaId] = useState<number | null>(personas[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function seal() {
    if (!content.trim()) return setStatus("편지 내용을 적어주세요.");
    if (!deliverOn || deliverOn < TOMORROW) return setStatus("도착일은 내일 이후로 정해주세요.");
    if (personaId == null) return setStatus("배달할 캐릭터를 골라주세요.");
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/letters/capsules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: content.trim(), deliverOn, personaId }),
      });
      const d = await res.json();
      if (!res.ok) return setStatus(d.error ?? "봉인 실패");
      const name = personas.find((p) => p.id === personaId)?.name ?? null;
      setSealed((xs) => [
        {
          id: d.capsule.id,
          deliverOn: d.capsule.deliverOn,
          createdAt: d.capsule.createdAt ?? new Date().toISOString(),
          personaName: name,
          personaId,
          reopenable: true,
          content: content.trim(),
        },
        ...xs,
      ]);
      setContent("");
      setStatus("봉인했어요. 도착일에 배달돼요. (5분 안에는 다시 열 수 있어요)");
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    if (!confirm("이 편지를 삭제할까요? 되돌릴 수 없어요.")) return;
    const res = await fetch(`/api/letters/capsules/${id}`, { method: "DELETE" });
    if (res.ok) setSealed((xs) => xs.filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 작성 */}
      <section className="rounded-card bg-surface p-4">
        <h2 className="font-display mb-1 text-sm font-semibold">미래의 나에게</h2>
        <p className="mb-3 text-[11px] opacity-50">
          편지를 봉인하면 도착일에 고른 캐릭터가 그대로 전해줘요. 봉인 후엔 열어볼 수 없어요(5분 유예).
        </p>
        {personas.length === 0 ? (
          <Link href="/characters" className="text-xs text-accent">
            배달할 캐릭터를 먼저 만들어주세요 →
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="지금의 마음을 미래의 나에게…"
              className={`${inputCls} resize-none`}
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDeliverOn(p.value)}
                  className={`rounded-control px-3 py-1.5 text-xs ring-1 ring-border ${
                    deliverOn === p.value ? "bg-accent text-black" : "bg-bg"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={deliverOn}
                min={TOMORROW}
                onChange={(e) => setDeliverOn(e.target.value)}
                className={inputCls}
              />
              <select
                value={personaId ?? ""}
                onChange={(e) => setPersonaId(Number(e.target.value))}
                className={inputCls}
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] opacity-60">{status}</span>
              <button
                onClick={seal}
                disabled={busy || !content.trim()}
                className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
              >
                {busy ? "봉인 중…" : "봉인하기"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 묻어둔 캡슐 */}
      <section>
        <h2 className="font-display mb-2 text-sm font-semibold">묻어둔 캡슐</h2>
        {sealed.length === 0 ? (
          <p className="text-xs opacity-40">아직 묻어둔 편지가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sealed.map((c) => {
              const canReopen = c.content != null && isReopenable(c.createdAt);
              return (
                <li key={c.id} className="rounded-card bg-surface p-4 ring-1 ring-border">
                  <div className="text-sm">📦 {fmtYmd(c.deliverOn)} 도착 예정</div>
                  <div className="mt-1 text-[11px] opacity-40">
                    {fmtYmd(c.createdAt.slice(0, 10))} 작성 · {c.personaName || "비서"} 배달
                  </div>
                  {editing === c.id && canReopen ? (
                    <EditForm
                      capsule={c}
                      personas={personas}
                      onCancel={() => setEditing(null)}
                      onSaved={(next) => {
                        setSealed((xs) => xs.map((x) => (x.id === c.id ? next : x)));
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      {canReopen && (
                        <button
                          onClick={() => setEditing(c.id)}
                          className="rounded-control bg-bg px-3 py-1.5 ring-1 ring-border"
                        >
                          다시 열기
                        </button>
                      )}
                      <button
                        onClick={() => del(c.id)}
                        className="rounded-control px-3 py-1.5 opacity-50 hover:text-red-400"
                      >
                        삭제
                      </button>
                      {canReopen && <span className="opacity-40">지금은 수정 가능 (봉인까지 5분)</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 받은 편지 */}
      <section>
        <h2 className="font-display mb-2 text-sm font-semibold">받은 편지</h2>
        <div className="mb-3">
          <GenerateLetterButton />
        </div>
        {receivedCapsules.length === 0 && weeklyLetters.length === 0 ? (
          <p className="text-xs leading-relaxed opacity-40">
            아직 받은 편지가 없어요.
            <br />
            묻어둔 캡슐은 도착일에, 주간 회고는 일요일 저녁에 도착해요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {receivedCapsules.map((c) => (
              <li key={`cap-${c.id}`} className="rounded-card bg-surface p-4 ring-1 ring-border">
                <div className="flex items-center gap-1.5 text-xs text-accent">
                  <span>📮</span>
                  <span>{fmtIso(c.deliveredAt)} 도착 · 미래의 나에게</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm opacity-80">{c.content}</p>
                <p className="mt-1 text-[11px] opacity-40">— {c.personaName || "캐릭터"} 배달</p>
              </li>
            ))}
            {weeklyLetters.map((l) => (
              <li key={`wk-${l.id}`}>
                <Link
                  href={`/letters/${l.id}`}
                  className="block rounded-card bg-surface p-4 ring-1 ring-border transition hover:ring-accent"
                >
                  <div className="flex items-center gap-1.5 text-xs text-accent">
                    <span>📮</span>
                    <span>
                      {fmtYmd(l.weekStart)} ~ {fmtYmd(l.weekEnd)}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm opacity-70">{l.body}</p>
                  {l.personaName && <p className="mt-1 text-[11px] opacity-40">— {l.personaName}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EditForm({
  capsule,
  personas,
  onCancel,
  onSaved,
}: {
  capsule: SealedCapsule;
  personas: PersonaOption[];
  onCancel: () => void;
  onSaved: (next: SealedCapsule) => void;
}) {
  const [content, setContent] = useState(capsule.content ?? "");
  const [deliverOn, setDeliverOn] = useState(capsule.deliverOn);
  const [personaId, setPersonaId] = useState<number | null>(capsule.personaId);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!content.trim()) return setErr("내용을 입력하세요.");
    if (deliverOn < TOMORROW) return setErr("도착일은 내일 이후로 정해주세요.");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/letters/capsules/${capsule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: content.trim(), deliverOn, personaId }),
      });
      const d = await res.json();
      if (!res.ok) return setErr(d.error ?? "수정 실패");
      onSaved({
        ...capsule,
        content: content.trim(),
        deliverOn,
        personaId,
        personaName: personas.find((p) => p.id === personaId)?.name ?? null,
      });
    } catch {
      setErr("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={5000}
        className={`${inputCls} resize-none`}
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={deliverOn}
          min={TOMORROW}
          onChange={(e) => setDeliverOn(e.target.value)}
          className={inputCls}
        />
        <select
          value={personaId ?? ""}
          onChange={(e) => setPersonaId(Number(e.target.value))}
          className={inputCls}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "다시 봉인"}
        </button>
        <button onClick={onCancel} className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border">
          취소
        </button>
      </div>
    </div>
  );
}
