"use client";

import { useState } from "react";

export interface GoogleInitial {
  configured: boolean; // 서버에 GOOGLE_CLIENT_ID/SECRET 설정됨
  connected: boolean;
  email: string | null;
  lastSyncAt: string | null;
  flash: string | null; // ?google=... 결과 안내
}

export default function GoogleCalendarSection({ initial }: { initial: GoogleInitial }) {
  const [connected, setConnected] = useState(initial.connected);
  const [status, setStatus] = useState(initial.flash ?? "");
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    setStatus("동기화 중…");
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      const d = await res.json();
      setStatus(res.ok ? `동기화됨 (받음 ${d.pulled ?? 0}·보냄 ${d.pushed ?? 0})` : (d.error ?? "동기화 실패"));
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Google 캘린더 연결을 해제할까요? (이미 동기화된 일정은 남아요)")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setStatus("연결 해제됨");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Google 캘린더</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        일정을 Google 캘린더와 양방향 동기화해요(약 15분 간격 + 일정 변경 시).
      </p>

      {!initial.configured ? (
        <p className="text-xs opacity-50">
          서버에 Google 연동이 설정되지 않았어요(GOOGLE_CLIENT_ID/SECRET). 관리자 설정 필요.
        </p>
      ) : connected ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs">
            <span className="opacity-50">연결됨</span>{" "}
            {initial.email && <span className="text-accent">{initial.email}</span>}
            {initial.lastSyncAt && (
              <span className="ml-2 opacity-40">
                마지막 동기화 {new Date(initial.lastSyncAt).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={sync}
              disabled={busy}
              className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              지금 동기화
            </button>
            <button
              onClick={disconnect}
              disabled={busy}
              className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border hover:text-red-400"
            >
              연결 해제
            </button>
          </div>
        </div>
      ) : (
        <a
          href="/api/google/connect"
          className="inline-block rounded-control bg-accent px-5 py-2 text-sm font-medium text-black"
        >
          Google 캘린더 연결
        </a>
      )}
    </section>
  );
}
