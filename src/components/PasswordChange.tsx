"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordChange({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setMsg("");
    if (next !== confirm) {
      setMsg("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setCur("");
        setNext("");
        setConfirm("");
        if (forced) {
          router.replace("/");
          router.refresh();
        } else {
          setMsg("변경됨 ✓");
        }
      } else {
        setMsg(data.error ?? "변경 실패");
      }
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

  return (
    <section
      className={`rounded-card bg-surface p-5 ${
        forced ? "ring-1 ring-accent" : ""
      }`}
    >
      <h2 className="font-display mb-1 text-sm font-semibold">비밀번호 변경</h2>
      {forced && (
        <p className="mb-3 rounded-control bg-accent-soft p-2 text-[11px] text-accent">
          임시 비밀번호로 로그인했습니다. 새 비밀번호를 설정해야 계속할 수 있어요.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <input
          type="password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          placeholder="현재 비밀번호"
          autoComplete="current-password"
          className={input}
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          className={input}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인"
          autoComplete="new-password"
          className={input}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving || !cur || !next || !confirm}
          className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "변경 중…" : "비밀번호 변경"}
        </button>
        {msg && <span className="text-xs opacity-70">{msg}</span>}
      </div>
    </section>
  );
}
