"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/ui/Dialog";
import type { PetRef } from "./types";

export interface RoomCard {
  id: number;
  name: string;
  petCount: number;
  avatars: (string | null)[];
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function RoomListView({
  rooms,
  waitingCount = 0,
  allPets = [],
}: {
  rooms: RoomCard[];
  waitingCount?: number;
  allPets?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [addPet, setAddPet] = useState(false);
  const [petName, setPetName] = useState("");
  const [petPersona, setPetPersona] = useState("");
  const [petRoom, setPetRoom] = useState<number | null>(rooms[0]?.id ?? null);
  const [status, setStatus] = useState("");
  // 방 만들기 — 이름 + 기존 펫 다중선택(바로 입주).
  const [makingRoom, setMakingRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [pickedPets, setPickedPets] = useState<Set<number>>(new Set());
  const [roomBusy, setRoomBusy] = useState(false);

  function togglePick(id: number) {
    setPickedPets((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function createRoom() {
    if (!roomName.trim()) return setStatus("방 이름을 입력하세요.");
    setRoomBusy(true);
    const res = await fetch("/api/pet-rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: roomName.trim(), petIds: [...pickedPets] }),
    });
    setRoomBusy(false);
    if (res.ok) {
      setRoomName("");
      setPickedPets(new Set());
      setMakingRoom(false);
      setStatus("");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setStatus(j.error ?? "방 생성 실패");
    }
  }
  async function renameRoom(id: number, cur: string) {
    const name = await dialog.prompt({ title: "방 이름 변경", defaultValue: cur, confirmText: "변경" });
    if (!name?.trim()) return;
    await fetch(`/api/pet-rooms/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    router.refresh();
  }
  async function deleteRoom(r: RoomCard) {
    const note = r.petCount > 0 ? ` 이 방의 펫 ${r.petCount}마리는 지워지지 않고 대기 상태로 보관돼요.` : "";
    if (!(await dialog.confirm({ message: `'${r.name}' 방을 삭제할까요?${note}`, danger: true, confirmText: "삭제" }))) return;
    const res = await fetch(`/api/pet-rooms/${r.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else {
      const j = await res.json().catch(() => ({}));
      await dialog.alert({ message: j.error ?? "삭제할 수 없어요." });
    }
  }
  async function createPet() {
    if (!petName.trim()) return setStatus("이름을 입력하세요.");
    const res = await fetch("/api/pets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: petName.trim(),
        personality: petPersona.trim() || null,
        roomId: petRoom,
      }),
    });
    if (res.ok) {
      setPetName("");
      setPetPersona("");
      setAddPet(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setStatus(j.error ?? "추가 실패");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAddPet((v) => !v)} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">
          펫 추가
        </button>
        <button onClick={() => setMakingRoom((v) => !v)} className={`rounded-control px-4 py-2 text-sm ring-1 ring-border ${makingRoom ? "bg-accent text-black" : "bg-surface"}`}>
          방 만들기
        </button>
        <Link href="/pets/moments" className="ml-auto rounded-control bg-surface px-4 py-2 text-sm ring-1 ring-border">
          🎬 순간
        </Link>
        <Link href="/pets/manage" className="rounded-control bg-surface px-4 py-2 text-sm ring-1 ring-border">
          🐾 관리{waitingCount > 0 ? ` · 대기 ${waitingCount}` : ""}
        </Link>
      </div>

      {addPet && (
        <section className="rounded-card bg-surface p-4">
          <div className="flex flex-col gap-2">
            <input value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="펫 이름" className={input} />
            <textarea value={petPersona} onChange={(e) => setPetPersona(e.target.value)} rows={2} placeholder="성격(선택)" className={`${input} resize-none`} />
            {rooms.length > 0 && (
              <select value={petRoom ?? ""} onChange={(e) => setPetRoom(e.target.value ? Number(e.target.value) : null)} className={input}>
                <option value="">대기(어느 방에도 없음)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[11px] opacity-60">{status || (rooms.length === 0 ? "첫 펫을 추가하면 기본 방이 생겨요." : "")}</span>
              <button onClick={createPet} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">
                봉인… 아니 입주!
              </button>
            </div>
          </div>
        </section>
      )}

      {makingRoom && (
        <section className="rounded-card bg-surface p-4">
          <div className="flex flex-col gap-3">
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="방 이름" className={input} />
            {allPets.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-text-dim">이 방에 넣을 펫{pickedPets.size > 0 ? ` · ${pickedPets.size}마리` : " (선택)"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {allPets.map((p) => {
                    const on = pickedPets.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePick(p.id)}
                        className={`rounded-control px-3 py-1.5 text-xs ring-1 ring-border ${on ? "bg-accent text-black" : "bg-bg"}`}
                      >
                        {on ? "✓ " : ""}{p.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] opacity-40">한 펫은 여러 방에 동시에 있을 수 있어요. 나중에 관리에서도 옮길 수 있어요.</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[11px] opacity-60">{status}</span>
              <button onClick={createRoom} disabled={roomBusy} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
                {roomBusy ? "만드는 중…" : "방 만들기"}
              </button>
            </div>
          </div>
        </section>
      )}

      {rooms.length === 0 ? (
        <p className="py-12 text-center text-sm opacity-40">아직 방이 없어요. 펫을 추가하면 시작돼요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4 ring-1 ring-border">
              <div className="flex items-center gap-2">
                <Link href={`/pets/${r.id}`} className="flex flex-1 items-center gap-2">
                  <div className="flex -space-x-2">
                    {r.avatars.slice(0, 5).map((a, i) =>
                      a ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={a} alt="" className="h-8 w-8 rounded-full bg-bg object-contain ring-2 ring-surface" />
                      ) : (
                        <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full bg-bg text-sm ring-2 ring-surface">🐾</span>
                      ),
                    )}
                    {r.petCount === 0 && <span className="text-xs opacity-40">빈 방</span>}
                  </div>
                  <div className="ml-1">
                    <div className="font-display text-sm font-semibold">{r.name}</div>
                    <div className="text-[11px] opacity-50">펫 {r.petCount}마리</div>
                  </div>
                </Link>
                <button onClick={() => renameRoom(r.id, r.name)} className="px-1 text-xs opacity-40 hover:opacity-100">이름</button>
                <button onClick={() => deleteRoom(r)} className="px-1 text-xs opacity-40 hover:text-red-400">삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { PetRef };
