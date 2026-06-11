"use client";

import { useEffect, useState, useCallback } from "react";

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
                  <button
                    onClick={() => navigator.clipboard?.writeText(i.url)}
                    className="truncate text-left opacity-80 hover:text-accent"
                    title="클릭하면 가입 링크 복사"
                  >
                    {i.url}
                  </button>
                  <button
                    onClick={() => cancelInvite(i.code)}
                    className="shrink-0 opacity-60 hover:text-red-400"
                  >
                    취소
                  </button>
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
            <li
              key={u.id}
              className="flex items-center justify-between rounded-lg bg-bg p-2 text-xs"
            >
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
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
