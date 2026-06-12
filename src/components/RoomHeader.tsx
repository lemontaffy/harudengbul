"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AvatarPicker from "@/components/AvatarPicker";

export interface RoomPersona {
  id: number;
  name: string; // 표시용(이미 기본값 처리됨)
  roleLabel: string;
  avatarPath: string | null;
  traits: string | null;
}

// 대화방 헤더 — 아바타·이름 탭 시 캐릭터 시트(보기 + 아바타 변경 + 이동).
// 편집(이름/역할/성격)은 /characters 책임 — 시트에 중복 구현하지 않는다.
export default function RoomHeader({ persona }: { persona: RoomPersona }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState(persona.avatarPath);
  const traitsPreview = (persona.traits ?? "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-border py-2.5">
        <Link
          href="/chat"
          aria-label="뒤로"
          className="-ml-1.5 rounded-control p-1 opacity-80 hover:bg-surface-2"
        >
          <ChevronLeft size={22} />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-label="캐릭터 정보"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-surface-2" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{persona.name}</div>
            <div className="truncate text-[11px] opacity-50">{persona.roleLabel}</div>
          </div>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-card bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="flex flex-col items-center gap-1 text-center">
              <AvatarPicker
                src={avatar}
                size={88}
                uploadUrl={`/api/personas/${persona.id}/avatar`}
                onUploaded={(p) => {
                  setAvatar(p);
                  router.refresh(); // 헤더 아바타 즉시 반영
                }}
              />
              <div className="mt-2 text-base font-semibold">{persona.name}</div>
              <div className="text-xs opacity-50">{persona.roleLabel}</div>
            </div>
            {traitsPreview && (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg p-3 text-xs leading-relaxed opacity-70">
                {traitsPreview}
              </p>
            )}
            <Link
              href="/characters"
              className="mt-4 block rounded-xl bg-bg py-2.5 text-center text-sm text-accent ring-1 ring-border"
            >
              캐릭터 관리에서 수정 →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
