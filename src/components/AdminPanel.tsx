"use client";

import { useEffect, useState, useCallback } from "react";

type Source = "db" | "env" | "none";

export interface OpenRouterInitial {
  model: string;
  modelSource: Source;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  apiKeySource: Source;
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

function badge(s: Source) {
  if (s === "db") return <span className="text-accent">DB</span>;
  if (s === "env") return <span className="opacity-60">env</span>;
  return <span className="text-red-400">미설정</span>;
}

const input =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

export default function AdminPanel({ orInitial }: { orInitial: OpenRouterInitial }) {
  // ── OpenRouter ──
  const [model, setModel] = useState(orInitial.model);
  const [baseUrl, setBaseUrl] = useState(
    orInitial.baseUrl === "https://openrouter.ai/api/v1" ? "" : orInitial.baseUrl,
  );
  const [apiKey, setApiKey] = useState("");
  const [orView, setOrView] = useState(orInitial);
  const [orStatus, setOrStatus] = useState("");
  const [orSaving, setOrSaving] = useState(false);

  async function saveOr() {
    setOrSaving(true);
    setOrStatus("");
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        openrouterModel: model,
        openrouterBaseUrl: baseUrl,
        openrouterApiKey: apiKey,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setApiKey("");
      setOrView(data);
      setOrStatus("저장됨 ✓");
    } else setOrStatus(data.error ?? "저장 실패");
    setOrSaving(false);
  }
  async function clearKey() {
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clearApiKey: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setOrView(data);
      setOrStatus("DB 키 삭제됨 (env 폴백)");
    }
  }

  // ── Invites ──
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

  // ── Users ──
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
      {/* OpenRouter (전역) */}
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">OpenRouter 연결 (전역)</h2>
        <p className="mb-4 text-[11px] opacity-50">
          모든 사용자가 공유합니다. 멤버는 변경할 수 없습니다.
        </p>

        <label className="mb-1 block text-xs opacity-60">API 키</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder={
            orView.apiKeySource !== "none"
              ? `현재: ${orView.apiKeyMasked} — 바꾸려면 새 키 입력`
              : "sk-or-... 입력"
          }
          className={input}
        />
        <div className="mb-4 mt-1 flex items-center justify-between text-[11px]">
          <span>출처: {badge(orView.apiKeySource)}</span>
          {orView.apiKeySource === "db" && (
            <button onClick={clearKey} className="opacity-60 hover:text-red-400">
              DB 키 삭제
            </button>
          )}
        </div>

        <label className="mb-1 block text-xs opacity-60">모델</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="anthropic/claude-sonnet-4.6"
          className={input}
        />
        <p className="mb-4 mt-1 text-[11px]">출처: {badge(orView.modelSource)}</p>

        <label className="mb-1 block text-xs opacity-60">Base URL (선택)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://openrouter.ai/api/v1 (기본값)"
          className={input}
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveOr}
            disabled={orSaving}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {orSaving ? "저장 중…" : "저장"}
          </button>
          {orStatus && <span className="text-xs opacity-70">{orStatus}</span>}
        </div>
      </section>

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
