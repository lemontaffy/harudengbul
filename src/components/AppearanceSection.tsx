"use client";

import { useState } from "react";

const PRESETS: { id: string; label: string; desc: string }[] = [
  { id: "lantern", label: "등불", desc: "다크 + 주황" },
  { id: "dawn", label: "새벽", desc: "딥네이비 + 하늘" },
  { id: "paper", label: "종이", desc: "라이트 + 잉크" },
];

// 커스텀 CSS 로 덮어쓸 수 있는 토큰들(도움말).
const VARS = [
  "--accent · 강조색",
  "--accent-soft · 강조 배경",
  "--bg · 배경",
  "--surface · 카드",
  "--surface-2 · 중첩 카드",
  "--border · 보더",
  "--text · 본문색",
  "--text-dim · 보조 텍스트",
  "--danger · 경고색",
  "--radius-card · 카드 둥글기",
  "--radius-control · 버튼/입력 둥글기",
];

const MAX = 20480; // 20KB

export default function AppearanceSection({
  initialTheme,
  initialCss,
}: {
  initialTheme: string;
  initialCss: string;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [css, setCss] = useState(initialCss);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function pickTheme(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id; // 새로고침 없이 즉시 반영
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: id }),
    });
    setStatus("테마 적용됨 ✓");
  }

  async function saveCss() {
    if (css.length > MAX) {
      setStatus(`커스텀 CSS는 20KB 이하만 가능해요.`);
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customCss: css }),
      });
      setStatus(
        res.ok
          ? "저장됨 ✓ — 적용은 설정 밖 화면에서 확인하세요"
          : "저장 실패",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1.5 block text-xs text-text-dim">테마</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickTheme(p.id)}
              className={`rounded-control px-2 py-2.5 text-center ${
                theme === p.id ? "bg-accent text-black" : "bg-surface-2 border border-border"
              }`}
            >
              <div className="text-sm font-medium">{p.label}</div>
              <div className="mt-0.5 text-xs opacity-70">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-dim">고급: 커스텀 CSS</label>
        <p className="mb-1.5 text-xs text-danger">
          ⚠️ 잘못된 CSS는 화면을 깨뜨릴 수 있어요. (설정 화면에는 적용되지 않으니, 깨져도
          여기서 되돌릴 수 있어요)
        </p>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={":root { --accent: #7dd3fc; }"}
          className="w-full resize-none rounded-control bg-bg px-3 py-2 font-mono text-xs outline-none ring-1 ring-border focus:ring-accent"
        />
        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={saveCss}
            disabled={saving}
            className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "저장 중…" : "CSS 저장"}
          </button>
          <span className="text-xs text-text-dim">
            {css.length}/{MAX}
          </span>
          {status && <span className="text-xs text-text-dim">{status}</span>}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-text-dim">
            덮어쓸 수 있는 변수 목록
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5 rounded-control bg-bg p-2 font-mono text-xs text-text-dim">
            {VARS.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
