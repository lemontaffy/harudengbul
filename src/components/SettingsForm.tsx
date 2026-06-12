"use client";

import { useState } from "react";

export interface SettingsInitial {
  proactiveEnabled: boolean;
  handoffEnabled: boolean;
  morningTime: string;
  eveningTime: string;
}

const input =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [proactive, setProactive] = useState(initial.proactiveEnabled);
  const [handoff, setHandoff] = useState(initial.handoffEnabled);
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
          proactiveEnabled: proactive,
          handoffEnabled: handoff,
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

  return (
    <div className="flex flex-col gap-6">
      {/* 선제 톡 */}
      <section className="rounded-card bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">선제 톡</h2>
          <button
            type="button"
            onClick={() => setProactive((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${proactive ? "bg-accent" : "bg-border"}`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition ${
                proactive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="mb-3 text-[11px] opacity-50">
          아침/저녁 먼저 말 걸기. 알림을 켜면 푸시로도 와요.
        </p>
        <div className="flex gap-3">
          <label className="flex-1 text-xs opacity-60">
            아침
            <input
              type="time"
              value={morning}
              onChange={(e) => setMorning(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
          <label className="flex-1 text-xs opacity-60">
            저녁
            <input
              type="time"
              value={evening}
              onChange={(e) => setEvening(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
        </div>
      </section>

      {/* 상담→비서 핸드오프 */}
      <section className="rounded-card bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">상담→비서 전달</h2>
          <button
            type="button"
            onClick={() => setHandoff((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${handoff ? "bg-accent" : "bg-border"}`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition ${
                handoff ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] opacity-50">
          상담 중 할 일이 나오면 동의를 받아 비서에게 전달하고, 홈 카드에서 등록할 수 있어요.
          끄면 상담가가 전달 제안을 하지 않습니다.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {status && <span className="text-xs opacity-70">{status}</span>}
      </div>
    </div>
  );
}
