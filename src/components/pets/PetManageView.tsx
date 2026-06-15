"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PetEditSheet from "./PetEditSheet";
import type { PetRef } from "./types";

export interface ManagePet {
  id: number;
  name: string;
  stage: string;
  avatar: string | null;
  roomNames: string[]; // 이 펫이 들어가 있는 방들(다대다). 방 배정은 각 방 화면에서.
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// 펫 목록·생성·편집. 방 배정은 각 방 화면(헤더 🐾＋)에서 — 여기선 안 함.
export default function PetManageView({
  pets,
  rooms,
  allPets,
}: {
  pets: ManagePet[];
  rooms: PetRef[];
  allPets: PetRef[];
}) {
  const router = useRouter();
  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [status, setStatus] = useState("");

  async function create() {
    if (!name.trim()) return setStatus("이름을 입력하세요.");
    // 대기로 생성 — 방에 넣는 건 방 화면에서.
    const res = await fetch("/api/pets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), personality: persona.trim() || null, roomId: null }),
    });
    if (res.ok) {
      setName("");
      setPersona("");
      setAdding(false);
      setStatus("");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setStatus(j.error ?? "추가 실패");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setAdding((v) => !v)} className="self-start rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">
        펫 만들기
      </button>

      {adding && (
        <section className="rounded-card bg-surface p-4">
          <div className="flex flex-col gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="펫 이름" className={input} />
            <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} placeholder="성격(선택)" className={`${input} resize-none`} />
            <p className="text-[11px] opacity-50">대기로 생성돼요 — 방에 넣는 건 각 방 화면(헤더 🐾＋)에서.</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] opacity-60">{status}</span>
              <button onClick={create} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">
                만들기
              </button>
            </div>
          </div>
        </section>
      )}

      {pets.length === 0 ? (
        <p className="py-12 text-center text-sm opacity-40">아직 펫이 없어요. ‘펫 만들기’로 시작해요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pets.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-card bg-surface p-3 ring-1 ring-border">
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full bg-bg object-contain" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-lg">🐾</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.name} <span className="text-[11px] opacity-40">· {p.stage}</span>
                </div>
                <div className="truncate text-[11px] opacity-50">{p.roomNames.length ? p.roomNames.join(", ") : "대기 중"}</div>
              </div>
              <button onClick={() => setEditId(p.id)} className="shrink-0 rounded-control bg-bg px-3 py-1.5 text-xs ring-1 ring-border hover:ring-accent">
                편집
              </button>
            </li>
          ))}
        </ul>
      )}

      {editId != null && (
        <PetEditSheet
          petId={editId}
          rooms={rooms}
          allPets={allPets}
          onClose={() => setEditId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
