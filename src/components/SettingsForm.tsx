"use client";

import { useState } from "react";

export interface SettingsInitial {
  activePersona: "theo" | "nora";
  proactiveEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  timezone: string;
}

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [persona, setPersona] = useState(initial.activePersona);
  const [proactive, setProactive] = useState(initial.proactiveEnabled);
  const [morning, setMorning] = useState(initial.morningTime.slice(0, 5));
  const [evening, setEvening] = useState(initial.eveningTime.slice(0, 5));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activePersona: persona,
          proactiveEnabled: proactive,
          morningTime: morning,
          eveningTime: evening,
        }),
      });
      setStatus(res.ok ? "저장됨 ✓" : "저장 실패");
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">활성 페르소나</h2>
        <div className="flex gap-2">
          {(["nora", "theo"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPersona(p)}
              className={`rounded-lg px-4 py-2 text-sm ${
                persona === p ? "bg-accent text-black" : "bg-bg ring-1 ring-white/10"
              }`}
            >
              {p === "nora" ? "노라" : "테오"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">선제 톡</h2>
          <button
            type="button"
            onClick={() => setProactive((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${
              proactive ? "bg-accent" : "bg-white/15"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition ${
                proactive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="mb-3 text-[11px] opacity-50">
          아침/저녁 먼저 말 걸기 (실제 발송은 Phase 2).
        </p>
        <div className="flex gap-3">
          <label className="flex-1 text-xs opacity-60">
            아침
            <input
              type="time"
              value={morning}
              onChange={(e) => setMorning(e.target.value)}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="flex-1 text-xs opacity-60">
            저녁
            <input
              type="time"
              value={evening}
              onChange={(e) => setEvening(e.target.value)}
              className={`${input} mt-1 w-full`}
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {status && <span className="text-xs opacity-70">{status}</span>}
      </div>
    </div>
  );
}
