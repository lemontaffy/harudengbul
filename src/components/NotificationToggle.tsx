"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function NotificationToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setSupported(false);
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // 개발 모드(SW 비활성)이거나 아직 등록 전
      setSupported(false);
      return;
    }
    setSupported(true);
    const sub = await reg.pushManager.getSubscription();
    setSubscribed(!!sub);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setStatus("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("알림 권한이 거부됐어요.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/vapid");
      const data = await res.json();
      if (!res.ok || !data.publicKey) {
        setStatus(data.error ?? "서버에 VAPID 키가 없어요.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!save.ok) {
        setStatus("구독 저장 실패");
        return;
      }
      setSubscribed(true);
      setStatus("알림 켜짐 ✓");
    } catch (err) {
      console.error(err);
      setStatus("구독 실패 — 브라우저 설정을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setStatus("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus("알림 꺼짐");
    } catch {
      setStatus("해지 실패");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setStatus("");
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? `테스트 발송됨 (${data.sent}건)` : (data.error ?? "발송 실패"));
  }

  return (
    <section className="rounded-2xl bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">알림(웹푸시)</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        선제 톡·일정 알람을 푸시로 받습니다. iOS는 홈 화면에 설치한 경우(16.4+)만 동작해요.
      </p>

      {supported === false ? (
        <p className="text-xs opacity-50">
          이 브라우저/환경에선 사용할 수 없어요. HTTPS에서 앱을 설치(또는 새로고침) 후 다시
          시도해 주세요.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          {subscribed ? (
            <>
              <button
                onClick={disable}
                disabled={busy}
                className="rounded-lg bg-bg px-4 py-2 text-sm ring-1 ring-white/10 disabled:opacity-50"
              >
                알림 끄기
              </button>
              <button
                onClick={test}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm text-accent disabled:opacity-50"
              >
                테스트 발송
              </button>
            </>
          ) : (
            <button
              onClick={enable}
              disabled={busy || supported === null}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {busy ? "처리 중…" : "알림 켜기"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
