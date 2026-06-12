"use client";

import { useState } from "react";
import AvatarPicker from "@/components/AvatarPicker";

export interface ProfileInitial {
  nickname: string;
  about: string;
  userAvatarPath: string | null;
}

const inputCls =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function ProfileSection({ initial }: { initial: ProfileInitial }) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [about, setAbout] = useState(initial.about);
  const [avatar, setAvatar] = useState<string | null>(initial.userAvatarPath);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, about }),
      });
      const data = await res.json();
      setStatus(res.ok ? "저장됨 ✓" : (data.error ?? "저장 실패"));
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">내 프로필</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        캐릭터들이 나를 이 닉네임으로 부르고, 소개를 참고해 대화해요.
      </p>

      <div className="flex items-center gap-3">
        <AvatarPicker
          src={avatar}
          size={56}
          uploadUrl="/api/profile/avatar"
          onUploaded={(p) => {
            setAvatar(p);
            setStatus("아바타 변경됨 ✓");
          }}
          onError={setStatus}
        />
        <span className="text-[11px] opacity-40">아바타를 눌러 변경</span>
      </div>

      <label className="mb-1 mt-4 block text-xs opacity-60">닉네임</label>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={40}
        placeholder="캐릭터들이 부를 이름"
        className={inputCls}
      />

      <label className="mb-1 mt-3 block text-xs opacity-60">소개 (선택)</label>
      <textarea
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="예: 그림 그리는 직장인. 요즘 번아웃이 좀 있어요."
        className={`${inputCls} resize-none`}
      />

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </section>
  );
}
