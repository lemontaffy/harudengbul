/// <reference lib="webworker" />
// 서비스워커 — Serwist 가 빌드 시 public/sw.js 로 컴파일한다.
// (tsconfig 에서 이 파일은 exclude — 전역 lib(dom) 오염 방지, 위 webworker 참조로 타입 확보)
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist 가 빌드 타임에 주입하는 프리캐시 매니페스트
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// ── 웹푸시 ──
// 서버(lib/push.ts)가 보낸 JSON {title, body, url?, tag?} 으로 알림 표시.
self.addEventListener("push", (event) => {
  let data: {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    requireInteraction?: boolean;
    timestamp?: number;
  } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || "하루등불";
  // icon = 알림 본문의 큰 앱 아이콘(컬러). badge = 상태바 작은 아이콘(단색 실루엣).
  //   badge에 컬러 아이콘을 주면 Android가 흰 네모로 마스킹하므로 전용 실루엣을 쓴다.
  // vibrate + renotify = Android heads-up(상단 배너) 유도.
  // requireInteraction = 자동 사라짐 방지(알람처럼 놓치면 안 되는 건 화면에 유지).
  // timestamp = 알림에 표시되는 시각(없으면 수신 시각).
  const options: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
    timestamp?: number;
  } = {
    body: data.body ?? "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge.png",
    tag: data.tag,
    renotify: !!data.tag,
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction ?? false,
    timestamp: data.timestamp ?? Date.now(),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 열린 탭이 있으면 포커스(해당 URL로 이동), 없으면 새 창.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of wins) {
        if ("focus" in c) {
          await c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
