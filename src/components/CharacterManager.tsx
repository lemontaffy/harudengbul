"use client";

import { useState } from "react";
import AvatarCropper from "@/components/AvatarCropper";

type Role = "counselor" | "secretary";

export interface Character {
  id: number;
  name: string | null;
  role: Role;
  avatarPath: string | null;
  traits: string | null;
}

export interface TriggerAssignments {
  activePersonaId: number | null;
  diaryReplyPersonaId: number | null;
  morningPersonaId: number | null;
  eveningPersonaId: number | null;
}

const ROLE_LABEL: Record<Role, string> = {
  counselor: "상담가",
  secretary: "비서",
};

const inputCls =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

function dn(name: string | null): string {
  return name?.trim() || "이름 없는 캐릭터";
}

export default function CharacterManager({
  initialCharacters,
  initialTriggers,
}: {
  initialCharacters: Character[];
  initialTriggers: TriggerAssignments;
}) {
  const [chars, setChars] = useState<Character[]>(initialCharacters);
  const [triggers, setTriggers] = useState<TriggerAssignments>(initialTriggers);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");

  const counselors = chars.filter((c) => c.role === "counselor");
  const secretaries = chars.filter((c) => c.role === "secretary");

  async function refresh() {
    const [pRes, sRes] = await Promise.all([
      fetch("/api/personas"),
      fetch("/api/settings"),
    ]);
    if (pRes.ok) setChars((await pRes.json()).personas);
    if (sRes.ok) {
      const s = await sRes.json();
      setTriggers({
        activePersonaId: s.activePersonaId,
        diaryReplyPersonaId: s.diaryReplyPersonaId,
        morningPersonaId: s.morningPersonaId,
        eveningPersonaId: s.eveningPersonaId,
      });
    }
  }

  async function archive(c: Character) {
    if (!confirm(`'${dn(c.name)}' 캐릭터를 보관할까요? (대화 기록은 남아요)`)) return;
    const res = await fetch(`/api/personas/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "보관 실패");
      return;
    }
    setStatus("보관됨");
    await refresh();
  }

  async function setTrigger(
    key: keyof TriggerAssignments,
    value: number,
  ) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "변경 실패");
      return;
    }
    setTriggers((t) => ({ ...t, [key]: value }));
    setStatus("저장됨 ✓");
  }

  return (
    <section className="rounded-2xl bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">캐릭터</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        역할(상담가/비서)별로 캐릭터를 자유롭게 추가·편집·보관할 수 있어요. 역할마다
        최소 1명은 있어야 합니다.
      </p>

      {/* 목록 */}
      <ul className="flex flex-col gap-2">
        {chars.map((c) =>
          editingId === c.id ? (
            <li key={c.id}>
              <CharacterForm
                initial={c}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  setStatus("저장됨 ✓");
                  await refresh();
                }}
                onError={setStatus}
              />
            </li>
          ) : (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl bg-bg p-3 ring-1 ring-white/10"
            >
              <Avatar path={c.avatarPath} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{dn(c.name)}</div>
                <div className="text-[11px] opacity-50">{ROLE_LABEL[c.role]}</div>
              </div>
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setAdding(false);
                }}
                className="rounded-lg bg-surface px-3 py-1.5 text-xs ring-1 ring-white/10"
              >
                편집
              </button>
              <button
                onClick={() => archive(c)}
                className="rounded-lg px-2 py-1.5 text-xs opacity-60 hover:text-red-400"
              >
                보관
              </button>
            </li>
          ),
        )}
      </ul>

      {/* 추가 */}
      {adding ? (
        <div className="mt-3">
          <CharacterForm
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              setStatus("추가됨 ✓");
              await refresh();
            }}
            onError={setStatus}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="mt-3 w-full rounded-xl border border-dashed border-white/15 py-2 text-sm opacity-70 hover:opacity-100"
        >
          + 캐릭터 추가
        </button>
      )}

      {/* 트리거 담당 */}
      <div className="mt-6 border-t border-white/10 pt-4">
        <h3 className="mb-1 text-sm font-semibold">담당 지정</h3>
        <p className="mb-3 text-[11px] opacity-50">
          일기 답장과 아침/저녁 먼저 말 걸기를 어떤 캐릭터가 맡을지 정해요.
        </p>
        <TriggerSelect
          label="일기 답장"
          hint="상담가"
          value={triggers.diaryReplyPersonaId}
          options={counselors}
          onChange={(v) => setTrigger("diaryReplyPersonaId", v)}
        />
        <TriggerSelect
          label="아침 인사"
          hint="비서"
          value={triggers.morningPersonaId}
          options={secretaries}
          onChange={(v) => setTrigger("morningPersonaId", v)}
        />
        <TriggerSelect
          label="저녁 체크인"
          hint="상담가"
          value={triggers.eveningPersonaId}
          options={counselors}
          onChange={(v) => setTrigger("eveningPersonaId", v)}
        />
      </div>
    </section>
  );
}

function Avatar({ path }: { path: string | null }) {
  if (!path) {
    return <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={path} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  );
}

function TriggerSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  options: Character[];
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs opacity-60">
        {label} <span className="opacity-40">· {hint}</span>
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      >
        {options.length === 0 && <option value="">(해당 역할 캐릭터 없음)</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {dn(o.name)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CharacterForm({
  initial,
  onCancel,
  onSaved,
  onError,
}: {
  initial?: Character;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "counselor");
  const [traits, setTraits] = useState(initial?.traits ?? "");
  const [avatarPath, setAvatarPath] = useState(initial?.avatarPath ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  async function save() {
    if (!name.trim()) {
      onError("이름을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        initial ? `/api/personas/${initial.id}` : "/api/personas",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), role, traits: traits.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error ?? "저장 실패");
        return;
      }
      onSaved();
    } catch {
      onError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(blob: Blob) {
    if (!initial) return; // 새 캐릭터는 먼저 저장 후 편집에서 업로드
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", blob, "avatar.jpg");
      const res = await fetch(`/api/personas/${initial.id}/avatar`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error ?? "업로드 실패");
        return;
      }
      setAvatarPath(data.avatarPath);
    } catch {
      onError("네트워크 오류");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl bg-bg p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <Avatar path={avatarPath} />
        <div className="flex-1">
          {initial ? (
            <label className="text-xs text-accent">
              {uploading ? "업로드 중…" : "아바타 변경"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCropFile(f); // 크롭 UI 먼저
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <span className="text-[11px] opacity-40">
              아바타는 저장 후 편집에서 올릴 수 있어요
            </span>
          )}
        </div>
      </div>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(blob) => {
            setCropFile(null);
            uploadAvatar(blob);
          }}
        />
      )}

      <label className="mb-1 mt-3 block text-xs opacity-60">이름</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="캐릭터 이름"
        className={inputCls}
      />

      <label className="mb-1 mt-3 block text-xs opacity-60">역할</label>
      <div className="flex gap-2">
        {(["counselor", "secretary"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-lg px-4 py-2 text-sm ${
              role === r ? "bg-accent text-black" : "bg-surface ring-1 ring-white/10"
            }`}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      <label className="mb-1 mt-3 block text-xs opacity-60">성격·말버릇 (traits)</label>
      <textarea
        value={traits}
        onChange={(e) => setTraits(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="예: 따뜻하지만 단호하다 / 가끔 시 한 구절을 인용한다"
        className={`${inputCls} resize-none`}
      />
      <p className="mt-1 text-[11px] opacity-40">
        말투 규칙·역할 규칙과 충돌하는 설정은 무시돼요(규칙이 우선).
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm opacity-60 ring-1 ring-white/10"
        >
          취소
        </button>
      </div>
    </div>
  );
}
