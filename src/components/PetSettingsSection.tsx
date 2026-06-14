"use client";

import { useState } from "react";

const OPTIONS: { id: "always" | "sometimes" | "never"; label: string; desc: string }[] = [
  { id: "always", label: "항상", desc: "받을 때마다 펫 말투로 생성" },
  { id: "sometimes", label: "가끔", desc: "절반쯤만 생성, 나머진 기본 대사" },
  { id: "never", label: "안 함", desc: "기본 대사만(LLM 미사용)" },
];

export default function PetSettingsSection({ initialFreq }: { initialFreq: string }) {
  const [freq, setFreq] = useState(initialFreq);
  const [status, setStatus] = useState("");

  async function pick(id: string) {
    setFreq(id);
    setStatus("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemReactionFreq: id }),
    }).catch(() => null);
    setStatus(res?.ok ? "저장됨 ✓" : "저장 실패");
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="mb-1.5 block text-xs text-text-dim">
          아이템 반응 대사 생성 — 펫이 아이템을 받거나 깰 때 보조 모델로 반응 대사를 만드는 빈도.
          (같은 펫×아이템 조합은 한 번만 생성해 저장하고, 이후엔 그 풀에서 재사용해요.)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              className={`rounded-control px-2 py-2.5 text-center ${
                freq === o.id ? "bg-accent text-black" : "bg-surface-2 border border-border"
              }`}
            >
              <div className="text-sm font-medium">{o.label}</div>
              <div className="mt-0.5 text-[11px] opacity-70">{o.desc}</div>
            </button>
          ))}
        </div>
        {status && <span className="mt-1 block text-xs text-text-dim">{status}</span>}
      </div>
    </div>
  );
}
