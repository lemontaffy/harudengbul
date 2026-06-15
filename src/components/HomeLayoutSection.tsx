"use client";

import { useState } from "react";

// 홈에서 끌 수 있는 섹션(키는 src/app/page.tsx 의 show(key) 와 일치).
const SECTIONS: { key: string; label: string }[] = [
  { key: "weather", label: "날씨" },
  { key: "chat", label: "채팅 입구" },
  { key: "pets", label: "펫" },
  { key: "memo", label: "주머니 메모" },
  { key: "events", label: "오늘 일정" },
  { key: "mood", label: "오늘 기분" },
  { key: "phrase", label: "한마디" },
];

export default function HomeLayoutSection({
  initialHidden,
}: {
  initialHidden: string[];
}) {
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [status, setStatus] = useState("");

  async function toggle(key: string) {
    const next = hidden.includes(key)
      ? hidden.filter((k) => k !== key)
      : [...hidden, key];
    setHidden(next);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hiddenHome: next }),
      });
      setStatus(res.ok ? "저장됨 ✓ (홈에서 확인)" : "저장 실패");
    } catch {
      setStatus("네트워크 오류");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-dim">
        홈 화면에 보일 항목을 고르세요. 끄면 홈에서 숨겨져요(데이터는 그대로).
      </p>
      {SECTIONS.map((sec) => {
        const on = !hidden.includes(sec.key);
        return (
          <label
            key={sec.key}
            className="flex cursor-pointer items-center justify-between rounded-control bg-surface-2 px-3 py-2.5"
          >
            <span className="text-sm">{sec.label}</span>
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(sec.key)}
              className="h-4 w-4 accent-accent"
            />
          </label>
        );
      })}
      {status && <span className="text-xs text-text-dim">{status}</span>}
    </div>
  );
}
