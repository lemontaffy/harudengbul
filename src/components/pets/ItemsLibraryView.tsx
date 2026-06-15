"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface LibraryItem {
  id: number;
  name: string;
  kind: "furniture" | "item";
  spritePath: string;
  spriteAltPath: string | null;
  brokenSpritePath: string | null;
  pixelRender: boolean;
  ownerPetId: number | null;
  ownerName: string | null;
  furnitureKind: "seat" | "fixture" | null;
  type: string | null;
  actionType: string | null;
  facing: "left" | "right";
  seatY: number;
  durabilityMax: number | null;
  durabilityNow: number;
  placedRooms: { roomId: number; roomName: string }[];
}

type PetOpt = { id: number; name: string };

const ACTIONS: { v: string; label: string }[] = [
  { v: "none", label: "없음(장식)" },
  { v: "letters", label: "편지함" },
  { v: "memo", label: "메모" },
  { v: "diary", label: "일기" },
  { v: "pet_diary", label: "펫 일기" },
  { v: "achievements", label: "업적" },
];

const input =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function ItemsLibraryView({
  items,
  pets,
}: {
  items: LibraryItem[];
  pets: PetOpt[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "furniture" | "item">("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const shown = items.filter((i) => filter === "all" || i.kind === filter);
  const petLabel = (id: number | null) =>
    id == null ? null : pets.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* 필터 + 추가 */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "furniture", "item"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-control px-3 py-1.5 text-sm ${
              filter === f ? "bg-accent text-black" : "bg-surface-2 ring-1 ring-border"
            }`}
          >
            {f === "all" ? "전체" : f === "furniture" ? "가구" : "아이템"}
          </button>
        ))}
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto rounded-control bg-surface px-4 py-2 text-sm ring-1 ring-border"
        >
          {adding ? "닫기" : "+ 추가"}
        </button>
      </div>

      {adding && (
        <AddForm
          pets={pets}
          busy={busy}
          setBusy={setBusy}
          onDone={(msg) => {
            setStatus(msg);
            setAdding(false);
            router.refresh();
          }}
        />
      )}
      {status && <p className="text-xs text-text-dim">{status}</p>}

      {shown.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-sm text-text-dim">
          아직 없어요. 위 ‘+ 추가’로 가구·아이템을 라이브러리에 올려두세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((it) => (
            <Row key={it.id} it={it} pets={pets} petLabel={petLabel} onChange={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ src, pixel }: { src: string; pixel: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-12 w-12 shrink-0 rounded-control bg-surface-2 object-contain"
      style={{ imageRendering: pixel ? "pixelated" : "auto" }}
    />
  );
}

function Row({
  it,
  pets,
  petLabel,
  onChange,
}: {
  it: LibraryItem;
  pets: PetOpt[];
  petLabel: (id: number | null) => string | null;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(it.name);
  const [ownerPetId, setOwnerPetId] = useState<string>(it.ownerPetId?.toString() ?? "");
  const [pixel, setPixel] = useState(it.pixelRender);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/pets/items/${it.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, ownerPetId: ownerPetId === "" ? null : Number(ownerPetId), pixelRender: pixel }),
    }).catch(() => {});
    setBusy(false);
    setEditing(false);
    onChange();
  }

  async function del() {
    // 삭제 안전장치 — 프로젝트 원칙상 무단 cascade 금지: 사전 확인.
    if (it.kind === "furniture" && it.placedRooms.length > 0) {
      const names = it.placedRooms.map((r) => r.roomName).join(", ");
      if (!confirm(`이 가구는 ${it.placedRooms.length}개 방(${names})에 배치돼 있어요.\n삭제하면 그 방들에서도 제거됩니다. 계속할까요?`))
        return;
    } else if (it.kind === "item" && it.ownerPetId != null) {
      if (!confirm(`'${petLabel(it.ownerPetId) ?? "펫"}'의 아이템이에요.\n삭제하면 소유·상호작용 기록과 함께 사라집니다. 계속할까요?`))
        return;
    } else if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;

    setBusy(true);
    await fetch(`/api/pets/items/${it.id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    onChange();
  }

  return (
    <li className="rounded-card bg-surface p-3 ring-1 ring-border">
      <div className="flex items-center gap-3">
        <Thumb src={it.spritePath} pixel={it.pixelRender} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{it.name}</span>
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-dim">
              {it.kind === "furniture" ? (it.furnitureKind === "seat" ? "의자" : "설치물") : "아이템"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-text-dim">
            {it.ownerName ? `${it.ownerName}의 것` : it.kind === "item" ? "소유 펫 없음" : null}
            {it.kind === "furniture" &&
              (it.placedRooms.length > 0
                ? `배치: ${it.placedRooms.map((r) => r.roomName).join(", ")}`
                : "배치 안 됨")}
            {it.kind === "item" && it.durabilityMax != null && ` · 내구 ${it.durabilityNow}/${it.durabilityMax}`}
          </p>
        </div>
        <button onClick={() => setEditing((v) => !v)} className="shrink-0 rounded-control px-2 py-1 text-xs ring-1 ring-border">
          {editing ? "취소" : "수정"}
        </button>
        <button onClick={del} disabled={busy} className="shrink-0 px-1.5 py-1 text-xs text-text-dim hover:text-danger disabled:opacity-50">
          ✕
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="이름" />
          <label className="text-xs text-text-dim">소유 펫</label>
          <select value={ownerPetId} onChange={(e) => setOwnerPetId(e.target.value)} className={input}>
            <option value="">없음</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pixel} onChange={(e) => setPixel(e.target.checked)} />
            픽셀 렌더(도트 또렷하게)
          </label>
          <button onClick={save} disabled={busy} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      )}
    </li>
  );
}

function AddForm({
  pets,
  busy,
  setBusy,
  onDone,
}: {
  pets: PetOpt[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: (msg: string) => void;
}) {
  const [kind, setKind] = useState<"furniture" | "item">("furniture");
  const [name, setName] = useState("");
  const [ownerPetId, setOwnerPetId] = useState("");
  const [pixel, setPixel] = useState(true);
  // 가구
  const [furnitureKind, setFurnitureKind] = useState<"seat" | "fixture">("seat");
  const [actionType, setActionType] = useState("none");
  const [facing, setFacing] = useState<"left" | "right">("left");
  // 아이템
  const [durabilityMax, setDurabilityMax] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const brokenRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setErr("");
    const file = fileRef.current?.files?.[0];
    if (!file) return setErr("스프라이트 파일을 고르세요.");
    if (!name.trim()) return setErr("이름을 입력하세요.");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    fd.set("name", name.trim());
    fd.set("pixelRender", String(pixel));
    if (ownerPetId) fd.set("ownerPetId", ownerPetId);
    if (kind === "furniture") {
      fd.set("furnitureKind", furnitureKind);
      if (furnitureKind === "fixture") fd.set("actionType", actionType);
      fd.set("facing", facing);
      const alt = altRef.current?.files?.[0];
      if (alt) fd.set("altFile", alt);
    } else {
      if (durabilityMax) fd.set("durabilityMax", durabilityMax);
      const broken = brokenRef.current?.files?.[0];
      if (broken) fd.set("brokenFile", broken);
    }
    setBusy(true);
    const res = await fetch("/api/pets/items", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "업로드 실패");
    onDone(data.warning ? `추가됨 ✓ (${data.warning})` : "추가됨 ✓");
  }

  return (
    <section className="flex flex-col gap-2 rounded-card bg-surface p-4 ring-1 ring-border">
      <div className="flex gap-2">
        {(["furniture", "item"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-control px-3 py-2 text-sm ${
              kind === k ? "bg-accent text-black" : "bg-surface-2 ring-1 ring-border"
            }`}
          >
            {k === "furniture" ? "가구" : "아이템"}
          </button>
        ))}
      </div>

      <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="이름 (예: 도미닉의 찻잔)" />

      <label className="text-xs text-text-dim">스프라이트 (gif/webp/png, ≤5MB · 도트는 원본 보존)</label>
      <input ref={fileRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="text-xs" />

      {kind === "furniture" ? (
        <>
          <div className="flex gap-2">
            {(["seat", "fixture"] as const).map((fk) => (
              <button
                key={fk}
                onClick={() => setFurnitureKind(fk)}
                className={`flex-1 rounded-control px-3 py-1.5 text-sm ${
                  furnitureKind === fk ? "bg-accent text-black" : "bg-surface-2 ring-1 ring-border"
                }`}
              >
                {fk === "seat" ? "의자(펫이 앉음)" : "설치물(탭 시 기능)"}
              </button>
            ))}
          </div>
          {furnitureKind === "fixture" && (
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={input}>
              {ACTIONS.map((a) => (
                <option key={a.v} value={a.v}>{a.label}</option>
              ))}
            </select>
          )}
          {furnitureKind === "seat" && (
            <select value={facing} onChange={(e) => setFacing(e.target.value as "left" | "right")} className={input}>
              <option value="left">앉으면 왼쪽 봄</option>
              <option value="right">앉으면 오른쪽 봄</option>
            </select>
          )}
          <label className="text-xs text-text-dim">상태 스프라이트(선택 · 알림/열림 등)</label>
          <input ref={altRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="text-xs" />
        </>
      ) : (
        <>
          <input
            value={durabilityMax}
            onChange={(e) => setDurabilityMax(e.target.value.replace(/[^0-9]/g, ""))}
            className={input}
            placeholder="내구도(선택 · 비우면 무한)"
            inputMode="numeric"
          />
          <label className="text-xs text-text-dim">파손 스프라이트(선택 · 비우면 CSS 금 폴백)</label>
          <input ref={brokenRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="text-xs" />
        </>
      )}

      <label className="text-xs text-text-dim">소유 펫(선택)</label>
      <select value={ownerPetId} onChange={(e) => setOwnerPetId(e.target.value)} className={input}>
        <option value="">없음</option>
        {pets.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pixel} onChange={(e) => setPixel(e.target.checked)} />
        픽셀 렌더(도트 또렷하게)
      </label>

      {err && <p className="text-xs text-danger">{err}</p>}
      <button onClick={submit} disabled={busy} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
        {busy ? "올리는 중…" : "라이브러리에 추가"}
      </button>
    </section>
  );
}
