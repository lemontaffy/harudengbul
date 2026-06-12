"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateLetterButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function gen() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/letters/generate", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.id) {
        router.push(`/letters/${data.id}`);
        router.refresh();
      } else {
        setMsg(data.error ?? "생성 실패");
      }
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={gen}
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {busy ? "쓰는 중…" : "이번 주 편지 받기"}
      </button>
      {msg && <span className="text-xs opacity-60">{msg}</span>}
    </div>
  );
}
