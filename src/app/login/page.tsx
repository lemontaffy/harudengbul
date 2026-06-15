"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "로그인 실패");
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "mb-3 w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs rounded-card bg-surface p-6"
      >
        <h1 className="mb-1 flex items-center gap-2 font-display text-xl font-semibold text-accent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-title.png?v=2" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
          하루등불
        </h1>
        <p className="mb-5 text-xs opacity-60">로그인</p>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="아이디"
          autoFocus
          autoComplete="username"
          className={input}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoComplete="current-password"
          className={input}
        />

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full rounded-control bg-accent py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "확인 중…" : "로그인"}
        </button>
        <p className="mt-4 text-center text-[11px] opacity-50">
          초대 코드가 있다면 받은 가입 링크로 접속하세요.
        </p>
      </form>
    </main>
  );
}
