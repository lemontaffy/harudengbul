"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// 햄버거에 들어가는 전체 메뉴(상단 이모지 버튼과 중복 포함).
const MENU: { href: string; label: string; emoji: string }[] = [
  { href: "/", label: "홈", emoji: "🏠" },
  { href: "/chat", label: "채팅", emoji: "💬" },
  { href: "/diary", label: "일기", emoji: "📔" },
  { href: "/events", label: "일정", emoji: "📅" },
  { href: "/ledger", label: "가계부", emoji: "💰" },
  { href: "/letters", label: "편지", emoji: "📮" },
  { href: "/pocket", label: "비상 주머니", emoji: "🆘" },
  { href: "/settings", label: "설정", emoji: "⚙️" },
];

// 상단에 따로 빼는 중요 메뉴.
const QUICK: { href: string; label: string; emoji: string }[] = [
  { href: "/", label: "홈", emoji: "🏠" },
  { href: "/chat", label: "채팅", emoji: "💬" },
  { href: "/settings", label: "설정", emoji: "⚙️" },
];

export default function NavMenu({
  isAdmin,
  username,
}: {
  isAdmin: boolean;
  username?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    setOpen(false);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const itemCls =
    "flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5";

  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      {QUICK.map((q) => (
        <Link
          key={q.href}
          href={q.href}
          aria-label={q.label}
          title={q.label}
          className="rounded-lg px-1.5 py-1 text-lg leading-none hover:bg-white/5"
        >
          {q.emoji}
        </Link>
      ))}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="메뉴"
        aria-expanded={open}
        className="rounded-lg px-1.5 py-1 text-lg leading-none hover:bg-white/5"
      >
        ☰
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl bg-surface py-1 shadow-xl ring-1 ring-white/10">
          {username && (
            <div className="border-b border-white/10 px-3 py-2 text-xs opacity-50">
              {username}
            </div>
          )}
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className={itemCls}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)} className={itemCls}>
              <span>🛠️</span>
              <span>어드민</span>
            </Link>
          )}
          <button
            onClick={logout}
            className={`${itemCls} w-full text-left text-red-400/80`}
          >
            <span>↩️</span>
            <span>로그아웃</span>
          </button>
        </div>
      )}
    </div>
  );
}
