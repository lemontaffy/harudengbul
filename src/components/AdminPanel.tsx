"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * 클립보드 복사 — HTTPS(보안 컨텍스트)에선 Clipboard API, 아니면(예: http/localhost)
 * 숨은 textarea + execCommand 폴백. 둘 다 실패하면 false.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백으로 진행 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({
  text,
  className = "",
  label = "복사",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  async function onClick() {
    const ok = await copyText(text);
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } else {
      // 복사 자체가 막힌 환경 — 수동 복사할 수 있게 노출
      prompt("복사가 막혀 있어요. 아래 내용을 길게 눌러 복사하세요:", text);
    }
  }
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded px-2 py-1 ${
        done ? "text-green-400" : "text-accent hover:opacity-80"
      } ${className}`}
      title="복사"
    >
      {done ? "복사됨 ✓" : label}
    </button>
  );
}

interface Invite {
  code: string;
  url: string;
  expiresAt: string;
  createdByName: string | null;
}
interface UserRow {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  todayUsage: number;
}

export default function AdminPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/admin/invites");
    if (res.ok) setInvites((await res.json()).invites);
  }, []);
  async function issueInvite() {
    const res = await fetch("/api/admin/invites", { method: "POST", body: "{}" });
    if (res.ok) await loadInvites();
  }
  async function cancelInvite(code: string) {
    await fetch(`/api/admin/invites?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    await loadInvites();
  }

  const [users, setUsers] = useState<UserRow[]>([]);
  const [tempPw, setTempPw] = useState<Record<number, string>>({});
  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users);
  }, []);
  async function toggleUser(u: UserRow) {
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: u.id, isActive: !u.isActive }),
    });
    await loadUsers();
  }
  async function resetPassword(u: UserRow) {
    if (!confirm(`${u.username}의 비밀번호를 초기화할까요?`)) return;
    const res = await fetch("/api/admin/users/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json();
    if (res.ok) setTempPw((m) => ({ ...m, [u.id]: data.tempPassword }));
    else alert(data.error ?? "초기화 실패");
  }

  useEffect(() => {
    loadInvites();
    loadUsers();
  }, [loadInvites, loadUsers]);

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-lg bg-surface/60 p-3 text-[11px] opacity-60">
        AI 연결은 사용자별입니다. 본인 키는{" "}
        <a href="/settings" className="text-accent">
          설정
        </a>{" "}
        에서 넣으세요.
      </p>

      {/* 초대 */}
      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">초대 코드</h2>
          <button
            onClick={issueInvite}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black"
          >
            + 발급 (7일)
          </button>
        </div>
        {invites.length === 0 ? (
          <p className="text-xs opacity-40">미사용 초대가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((i) => (
              <li key={i.code} className="rounded-lg bg-bg p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <code className="select-all truncate opacity-80" title={i.url}>
                    {i.url}
                  </code>
                  <div className="flex shrink-0 items-center gap-1">
                    <CopyButton text={i.url} label="링크 복사" />
                    <CopyButton
                      text={i.code}
                      label="코드만"
                      className="opacity-70"
                    />
                    <button
                      onClick={() => cancelInvite(i.code)}
                      className="rounded px-2 py-1 opacity-60 hover:text-red-400"
                    >
                      취소
                    </button>
                  </div>
                </div>
                <p className="mt-1 opacity-40">
                  만료: {new Date(i.expiresAt).toLocaleString("ko-KR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 사용자 */}
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">사용자</h2>
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id} className="rounded-lg bg-bg p-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{u.username}</span>
                  {u.role === "admin" && (
                    <span className="ml-2 text-accent">admin</span>
                  )}
                  <span className="ml-2 opacity-40">오늘 {u.todayUsage}회</span>
                </div>
                {u.role === "admin" ? (
                  <span className="opacity-40">—</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => resetPassword(u)}
                      className="opacity-60 hover:text-accent"
                    >
                      비번 초기화
                    </button>
                    <button
                      onClick={() => toggleUser(u)}
                      className={`rounded px-2 py-1 ${
                        u.isActive
                          ? "text-accent hover:text-red-400"
                          : "text-red-400 hover:text-accent"
                      }`}
                    >
                      {u.isActive ? "활성" : "비활성"}
                    </button>
                  </div>
                )}
              </div>
              {tempPw[u.id] && (
                <div className="mt-1 flex items-center gap-2 rounded bg-accent/10 px-2 py-1 text-accent">
                  <code className="select-all flex-1 truncate">
                    임시 비밀번호: {tempPw[u.id]}
                  </code>
                  <span className="shrink-0 opacity-50">1회 표시</span>
                  <CopyButton text={tempPw[u.id]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
