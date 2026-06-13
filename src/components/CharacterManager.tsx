"use client";

import { useState } from "react";
import { useDialog } from "@/components/ui/Dialog";
import AvatarPicker from "@/components/AvatarPicker";

type Role = "counselor" | "secretary" | "nutritionist" | "study_mate" | "friend";
const ALL_ROLES: Role[] = [
  "counselor",
  "secretary",
  "nutritionist",
  "study_mate",
  "friend",
];

export interface Character {
  id: number;
  name: string | null;
  roles: Role[]; // 첫 원소가 주 역할
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
  nutritionist: "영양사",
  study_mate: "스터디 메이트",
  friend: "친구",
};
const rolesLabel = (roles: Role[]) => roles.map((r) => ROLE_LABEL[r]).join(" · ");

const inputCls =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

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
  const dialog = useDialog();
  const [chars, setChars] = useState<Character[]>(initialCharacters);
  const [triggers, setTriggers] = useState<TriggerAssignments>(initialTriggers);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");

  const counselors = chars.filter((c) => c.roles.includes("counselor"));
  const secretaries = chars.filter((c) => c.roles.includes("secretary"));

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
    if (!(await dialog.confirm({ message: `'${dn(c.name)}' 캐릭터를 보관할까요?\n대화 기록은 남아요.`, confirmText: "보관" }))) return;
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
    <section className="rounded-card bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">캐릭터</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        역할(상담가·비서·영양사·스터디 메이트·친구)별로 캐릭터를 자유롭게 추가·편집·보관할
        수 있어요. 상담가·비서는 최소 1명씩 있어야 하고, 나머지 역할은 선택입니다.
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
              className="flex items-center gap-3 rounded-xl bg-bg p-3 ring-1 ring-border"
            >
              <AvatarPicker
                src={c.avatarPath}
                size={40}
                uploadUrl={`/api/personas/${c.id}/avatar`}
                onUploaded={(p) =>
                  setChars((cs) =>
                    cs.map((x) => (x.id === c.id ? { ...x, avatarPath: p } : x)),
                  )
                }
                onError={setStatus}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{dn(c.name)}</div>
                <div className="text-[11px] opacity-50">{rolesLabel(c.roles)}</div>
              </div>
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setAdding(false);
                }}
                className="rounded-control bg-surface px-3 py-1.5 text-xs ring-1 ring-border"
              >
                편집
              </button>
              <button
                onClick={() => archive(c)}
                className="rounded-control px-2 py-1.5 text-xs opacity-60 hover:text-red-400"
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
          className="mt-3 w-full rounded-xl border border-dashed border-border py-2 text-sm opacity-70 hover:opacity-100"
        >
          + 캐릭터 추가
        </button>
      )}

      {/* 트리거 담당 */}
      <div className="mt-6 border-t border-border pt-4">
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
    return <div className="h-9 w-9 shrink-0 rounded-full bg-surface-2" />;
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
  const [roles, setRoles] = useState<Role[]>(initial?.roles ?? ["counselor"]);
  const [traits, setTraits] = useState(initial?.traits ?? "");

  // 선택 순서 = 우선순위(첫 원소가 주 역할). counselor 는 단독 전용.
  function toggleRole(r: Role) {
    setRoles((cur) => {
      if (cur.includes(r)) {
        const next = cur.filter((x) => x !== r);
        return next.length ? next : cur; // 최소 1개 유지
      }
      if (r === "counselor") return ["counselor"]; // 단독 전용
      if (cur.includes("counselor")) return [r]; // counselor 해제하고 교체
      if (cur.length >= 3) return cur; // 최대 3개
      return [...cur, r];
    });
  }
  const [avatarPath, setAvatarPath] = useState(initial?.avatarPath ?? null);
  const [saving, setSaving] = useState(false);

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
          body: JSON.stringify({ name: name.trim(), roles, traits: traits.trim() }),
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

  return (
    <div className="rounded-xl bg-bg p-4 ring-1 ring-border">
      <div className="flex items-center gap-3">
        {initial ? (
          <AvatarPicker
            src={avatarPath}
            size={44}
            uploadUrl={`/api/personas/${initial.id}/avatar`}
            onUploaded={setAvatarPath}
            onError={onError}
          />
        ) : (
          <>
            <Avatar path={avatarPath} />
            <span className="text-[11px] opacity-40">
              아바타는 저장 후 눌러서 올릴 수 있어요
            </span>
          </>
        )}
      </div>

      <label className="mb-1 mt-3 block text-xs opacity-60">이름</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="캐릭터 이름"
        className={inputCls}
      />

      <label className="mb-1 mt-3 block text-xs opacity-60">
        역할 <span className="opacity-40">· 여러 개 가능(최대 3). 먼저 고른 게 주 역할</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {ALL_ROLES.map((r) => {
          const idx = roles.indexOf(r);
          const selected = idx >= 0;
          // 비활성화는 "최대 3개 초과" 뿐. counselor 단독 전용은 비활성화가 아니라
          // toggleRole 의 교체로 처리한다(상담가↔다른 역할 클릭 시 서로 교체) — 안 그러면
          // 상담가 선택 상태에서 빠져나갈 수 없어 다른 역할을 못 고르는 버그가 됨.
          const disabled = !selected && r !== "counselor" && roles.length >= 3;
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              disabled={disabled}
              className={`flex items-center gap-1 rounded-control px-4 py-2 text-sm ${
                selected ? "bg-accent text-black" : "bg-surface ring-1 ring-border"
              } ${disabled ? "opacity-30" : ""}`}
            >
              {selected && (
                <span className="text-[10px] font-bold">{idx === 0 ? "주" : idx + 1}</span>
              )}
              {ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] opacity-40">
        상담가는 단독 전용이에요 — 상담가를 고르면 다른 역할이 해제되고, 다른 역할을
        고르면 상담가가 해제돼요.
      </p>

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
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border"
        >
          취소
        </button>
      </div>
    </div>
  );
}
