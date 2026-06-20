"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  NotebookPen,
  CalendarDays,
  MoreHorizontal,
  Wallet,
  Mail,
  LifeBuoy,
  Users,
  Settings,
  Shield,
  PawPrint,
  Inbox,
  Award,
  Search,
  type LucideIcon,
} from "lucide-react";

type Tab = { href: string; label: string; Icon: LucideIcon };
const TABS: Tab[] = [
  { href: "/", label: "홈", Icon: Home },
  { href: "/chat", label: "채팅", Icon: MessageCircle },
  { href: "/diary", label: "일기", Icon: NotebookPen },
  { href: "/events", label: "일정", Icon: CalendarDays },
];
const MORE: { href: string; label: string; Icon: LucideIcon; admin?: boolean }[] = [
  { href: "/search", label: "통합 검색", Icon: Search },
  { href: "/ledger", label: "가계부", Icon: Wallet },
  { href: "/letters", label: "편지", Icon: Mail },
  { href: "/memos", label: "주머니 메모", Icon: Inbox },
  { href: "/pets", label: "펫 룸", Icon: PawPrint },
  { href: "/achievements", label: "업적판", Icon: Award },
  { href: "/pocket", label: "비상 주머니", Icon: LifeBuoy },
  { href: "/characters", label: "캐릭터", Icon: Users },
  { href: "/settings", label: "설정", Icon: Settings },
  { href: "/admin", label: "관리자", Icon: Shield, admin: true },
];

// 탭바를 숨길 경로: 로그인/가입/관리자/대화방 내부(/chat/<id>).
function isHidden(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/signup") return true;
  if (pathname.startsWith("/admin")) return true;
  if (/^\/chat\/.+/.test(pathname)) return true; // 대화방(입력창이 하단을 씀)
  return false;
}

export default function TabBar() {
  const pathname = usePathname();
  const hidden = isHidden(pathname);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/nav");
      if (!res.ok) return;
      const d = await res.json();
      setIsAdmin(!!d.isAdmin);
      setUnread(d.unreadTotal ?? 0);
    } catch {
      /* 비로그인 등 — 무시 */
    }
  }, []);

  // 경로가 바뀔 때마다(방 진입→복귀 등) 미읽음 합계 갱신.
  useEffect(() => {
    if (!hidden) refresh();
  }, [hidden, pathname, refresh]);

  // 고정 탭바가 콘텐츠를 가리지 않도록 body 하단 패딩(safe-area 포함)을 토글.
  useEffect(() => {
    document.body.style.paddingBottom = hidden
      ? ""
      : "calc(4.25rem + env(safe-area-inset-bottom))";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [hidden]);

  useEffect(() => {
    if (hidden) setMoreOpen(false);
  }, [hidden]);

  if (hidden) return null;

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const moreActive = MORE.some((m) => pathname.startsWith(m.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-card bg-surface p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-3 gap-2">
              {MORE.filter((m) => !m.admin || isAdmin).map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs hover:bg-surface-2"
                >
                  <m.Icon size={22} strokeWidth={1.75} className="opacity-80" />
                  <span>{m.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch">
          {TABS.map((t) => {
            const on = active(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                  on ? "text-accent" : "opacity-60"
                }`}
              >
                <t.Icon size={22} strokeWidth={on ? 2.25 : 1.75} />
                {t.href === "/chat" && unread > 0 && (
                  <span className="absolute right-[22%] top-1 min-w-[15px] rounded-full bg-accent px-1 text-[9px] font-bold leading-[15px] text-black">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              moreActive || moreOpen ? "text-accent" : "opacity-60"
            }`}
          >
            <MoreHorizontal size={22} strokeWidth={1.75} />
            <span>더보기</span>
          </button>
        </div>
      </nav>
    </>
  );
}
