"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RoomPetOpt {
  id: number;
  name: string;
  avatar: string | null; // 대표 idle 스프라이트
}

// 방 중심 펫 추가 — 헤더 버튼 + 시트. 이 방의 펫을 idle 이미지 리스트로 넣고/빼기만(편집·생성 없음).
export default function RoomPetsManager({
  roomId,
  pets,
  roomPetIds,
}: {
  roomId: number;
  pets: RoomPetOpt[];
  roomPetIds: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inRoom, setInRoom] = useState<Set<number>>(new Set(roomPetIds));
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(petId: number) {
    const has = inRoom.has(petId);
    setBusy(petId);
    setInRoom((s) => {
      const n = new Set(s);
      if (has) n.delete(petId);
      else n.add(petId);
      return n;
    });
    await fetch(`/api/pet-rooms/${roomId}/members`, {
      method: has ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ petId }),
    }).catch(() => {});
    setBusy(null);
    router.refresh(); // 방 화면 즉시 반영
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="이 방에 펫 넣기/빼기"
        className="rounded-control bg-surface px-2.5 py-1 text-sm ring-1 ring-border"
      >
        🐾＋
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[80vh] max-w-md overflow-y-auto rounded-t-card bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <h2 className="mb-1 font-display text-sm font-semibold">이 방의 펫</h2>
            <p className="mb-3 text-[11px] opacity-50">탭해서 이 방에 넣거나 빼요. 같은 펫이 여러 방에 있어도 돼요(방마다 1마리).</p>
            {pets.length === 0 ? (
              <p className="py-8 text-center text-xs opacity-40">아직 펫이 없어요. ‘펫 룸 → 관리’에서 만들어요.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pets.map((p) => {
                  const on = inRoom.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => toggle(p.id)}
                        disabled={busy === p.id}
                        className={`flex w-full items-center gap-3 rounded-card p-2 ring-1 ${on ? "bg-accent/15 ring-accent" : "bg-bg ring-border"} disabled:opacity-50`}
                      >
                        {p.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full bg-surface-2 object-contain" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg">🐾</span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-left text-sm">{p.name}</span>
                        <span className={`shrink-0 text-xs ${on ? "text-accent" : "opacity-40"}`}>{on ? "✓ 이 방" : "＋ 추가"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button onClick={() => setOpen(false)} className="mt-3 w-full rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border">
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
