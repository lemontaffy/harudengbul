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
  roomId: number | null;
  roomName: string | null;
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// 전역 펫 관리 — 방과 무관하게 전체 펫 나열·생성·방 배정·편집.
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
  const [newRoom, setNewRoom] = useState<number | null>(null); // 기본 대기
  const [status, setStatus] = useState("");

  async function assign(petId: number, roomId: number | null) {
    await fetch(`/api/pets/${petId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    router.refresh();
  }
  async function create() {
    if (!name.trim()) return setStatus("이름을 입력하세요.");
    const res = await fetch("/api/pets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), personality: persona.trim() || null, roomId: newRoom }),
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
            <select value={newRoom ?? ""} onChange={(e) => setNewRoom(e.target.value ? Number(e.target.value) : null)} className={input}>
              <option value="">대기(어느 방에도 없음)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
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
                <div className="text-[11px] opacity-50">{p.roomName ?? "대기 중"}</div>
              </div>
              <select
                value={p.roomId ?? ""}
                onChange={(e) => assign(p.id, e.target.value ? Number(e.target.value) : null)}
                className="shrink-0 rounded-control bg-bg px-2 py-1.5 text-xs ring-1 ring-border"
                title="방 배정"
              >
                <option value="">대기</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
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
