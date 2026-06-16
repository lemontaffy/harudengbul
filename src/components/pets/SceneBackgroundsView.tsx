"use client";

import { useRef, useState } from "react";

export interface SceneBg {
  id: number;
  kind: "love" | "hostile";
  path: string;
}

const KINDS: { v: "love" | "hostile"; label: string; emoji: string }[] = [
  { v: "love", label: "애정(연인·단짝)", emoji: "💞" },
  { v: "hostile", label: "대치(혐관·라이벌)", emoji: "⚡" },
];

// 관계 이벤트 장면 배경 관리(전역) — 톤별 업로드/삭제. 재생 때 톤에 맞춰 랜덤 1장.
export default function SceneBackgroundsView({ initial = [] }: { initial?: SceneBg[] }) {
  const [list, setList] = useState<SceneBg[]>(initial);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const refs = { love: useRef<HTMLInputElement>(null), hostile: useRef<HTMLInputElement>(null) };

  async function upload(kind: "love" | "hostile", file: File) {
    if (file.size > 5 * 1024 * 1024) return setMsg("이미지는 5MB 이하만 가능해요.");
    setBusyKind(kind);
    setMsg("");
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("image", file);
    const res = await fetch("/api/scene-backgrounds", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusyKind(null);
    if (res.ok) setList((xs) => [d.background, ...xs]);
    else setMsg(d.error ?? "업로드 실패");
  }
  async function del(id: number) {
    setList((xs) => xs.filter((x) => x.id !== id));
    await fetch(`/api/scene-backgrounds/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-dim">
        관계 이벤트(‘순간’) 장면에 깔리는 배경이에요. 톤별로 여러 장 올리면 재생 때 랜덤으로 골라요. 비우면 기본 그라데이션. 세로(3:4) 권장.
      </p>
      {KINDS.map((k) => {
        const items = list.filter((b) => b.kind === k.v);
        return (
          <div key={k.v}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">{k.emoji} {k.label}</span>
              <button
                onClick={() => refs[k.v].current?.click()}
                disabled={busyKind === k.v}
                className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
              >
                {busyKind === k.v ? "올리는 중…" : "+ 배경 올리기"}
              </button>
              <input
                ref={refs[k.v]}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(k.v, f);
                }}
              />
            </div>
            {items.length === 0 ? (
              <p className="rounded-card bg-surface-2 p-3 text-center text-[11px] text-text-dim ring-1 ring-border">아직 없어요 (기본 그라데이션 사용)</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {items.map((b) => (
                  <li key={b.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.path} alt="" className="aspect-[3/4] w-full rounded-control object-cover ring-1 ring-border" />
                    <button
                      onClick={() => del(b.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {msg && <p className="text-xs text-accent">{msg}</p>}
    </div>
  );
}
