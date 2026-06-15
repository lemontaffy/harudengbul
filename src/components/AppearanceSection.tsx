"use client";

import { useRef, useState } from "react";

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

interface CssTheme {
  id: number;
  name: string;
  css: string;
}

export default function AppearanceSection({
  initialTheme,
  initialCss,
  initialThemes = [],
}: {
  initialTheme: string;
  initialCss: string;
  initialThemes?: CssTheme[];
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [css, setCss] = useState(initialCss);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [themes, setThemes] = useState<CssTheme[]>(initialThemes);
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // .css 파일 업로드 — 내용을 편집창에 채운다(검토 후 '적용'). 서버 업로드 아님(텍스트 로컬 읽기).
  function onPickCss(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX) {
      setStatus("CSS 파일은 20KB 이하만 가능해요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCss(text.slice(0, MAX));
      setStatus("파일에서 불러왔어요 — 확인 후 '적용'을 누르세요");
    };
    reader.onerror = () => setStatus("파일을 읽지 못했어요");
    reader.readAsText(file);
  }

  // 적용본(settings.custom_css) 설정 — 설정 밖 화면에 즉시 반영.
  async function applyCss(value: string) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customCss: value }),
    });
  }

  // 현재 편집 중인 CSS 를 이름 붙여 보관함에 저장.
  async function stashCurrent() {
    const name = newName.trim();
    if (!name) return setStatus("저장할 이름을 입력하세요.");
    if (css.length > MAX) return setStatus("커스텀 CSS는 20KB 이하만 가능해요.");
    const res = await fetch("/api/css-themes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, css }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setThemes((xs) => [data.theme, ...xs]);
      setNewName("");
      setStatus(`'${name}' 보관함에 저장됨 ✓`);
    } else {
      setStatus(data.error ?? "저장 실패");
    }
  }

  // 보관함 테마 적용 — 편집창에 불러오고 즉시 적용(active customCss).
  async function applyTheme(t: CssTheme) {
    setCss(t.css);
    await applyCss(t.css);
    setStatus(`'${t.name}' 적용됨 ✓`);
  }

  async function deleteTheme(t: CssTheme) {
    setThemes((xs) => xs.filter((x) => x.id !== t.id));
    await fetch(`/api/css-themes/${t.id}`, { method: "DELETE" }).catch(() => {});
  }

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
      await applyCss(css);
      setStatus("적용됨 ✓ — 설정 밖 화면에서 확인하세요");
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
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs text-text-dim">고급: 커스텀 CSS</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-control bg-surface-2 px-2.5 py-1 text-[11px] ring-1 ring-border"
          >
            .css 파일 올리기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".css,text/css"
            className="hidden"
            onChange={onPickCss}
          />
        </div>
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
            {saving ? "적용 중…" : "적용"}
          </button>
          <span className="text-xs text-text-dim">
            {css.length}/{MAX}
          </span>
          {status && <span className="text-xs text-text-dim">{status}</span>}
        </div>

        {/* 보관함 — 여러 CSS 테마를 쌓아두고 골라 적용 */}
        <div className="mt-3 border-t border-border pt-3">
          <label className="mb-1.5 block text-xs text-text-dim">테마 보관함</label>
          <div className="mb-2 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder="현재 CSS를 이 이름으로 저장"
              className="flex-1 rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
            />
            <button onClick={stashCurrent} className="shrink-0 rounded-control bg-surface-2 px-3 py-2 text-sm ring-1 ring-border">
              보관
            </button>
          </div>
          {themes.length === 0 ? (
            <p className="text-xs text-text-dim">저장된 테마가 없어요. 편집한 CSS를 이름 붙여 보관해두고 골라 적용해요.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {themes.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-control bg-bg p-2 ring-1 ring-border">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  <button onClick={() => applyTheme(t)} className="shrink-0 rounded-control bg-accent px-3 py-1 text-xs font-medium text-black">
                    적용
                  </button>
                  <button onClick={() => setCss(t.css)} className="shrink-0 rounded-control px-2 py-1 text-xs ring-1 ring-border" title="편집창에 불러오기">
                    불러오기
                  </button>
                  <button onClick={() => deleteTheme(t)} className="shrink-0 px-1.5 py-1 text-xs text-text-dim hover:text-danger">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
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
