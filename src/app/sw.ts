/// <reference lib="webworker" />
// 서비스워커 — Serwist 가 빌드 시 public/sw.js 로 컴파일한다.
// (tsconfig 에서 이 파일은 exclude — 전역 lib(dom) 오염 방지, 위 webworker 참조로 타입 확보)
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist 가 빌드 타임에 주입하는 프리캐시 매니페스트
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 셀프호스팅 폰트 전용 캐시 — defaultCache 의 static-font-assets(maxEntries:4)보다 먼저 매칭.
// 본문(Pretendard)·제목(Paperlogy×2)·펫 일기(손글씨2·픽셀2) 합 6+개라 4개 한도면 일기 폰트가
// 들어올 때 Pretendard/Paperlogy 가 LRU 로 축출돼 "일기 외 폰트가 풀리는" 증상이 났다. 넉넉히 24개.
const fontCache = {
  matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
    sameOrigin && request.destination === "font",
  handler: new CacheFirst({
    cacheName: "haru-fonts",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 24,
        maxAgeSeconds: 60 * 60 * 24 * 365,
        purgeOnQuotaError: true,
      }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [fontCache, ...defaultCache],
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
    eventId?: number;
    image?: string;
    actions?: { action: string; title: string }[];
    snoozeToken?: string;
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
    image?: string;
    actions?: { action: string; title: string }[];
  } = {
    body: data.body ?? "",
    icon: "/icons/icon-push.png?v=3", // ?v = 폰 SW/OS 캐시 무력화(아이콘 교체 시 숫자 ↑)
    badge: "/icons/badge.png?v=3",
    tag: data.tag,
    renotify: !!data.tag,
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction ?? false,
    timestamp: data.timestamp ?? Date.now(),
    // 큰 이미지(2:1) — 지원 환경만 표시, iOS 등은 무시.
    ...(data.image ? { image: data.image } : {}),
    // 액션 버튼 최대 2개.
    ...(data.actions?.length ? { actions: data.actions.slice(0, 2) } : {}),
    data: {
      url: data.url || "/",
      eventId: data.eventId,
      snoozeToken: data.snoozeToken,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭/액션:
//  - "snooze" 액션: /api/alarms/snooze 호출(앱 안 염, 백그라운드).
//  - "ack"(확인) 액션: 반복 알림 중단(앱 안 염).
//  - 본문 탭(액션 없음): 알람이면 ack 후, 해당 URL로 포커스/새 창.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const nd =
    (event.notification.data as {
      url?: string;
      eventId?: number;
      snoozeToken?: string;
    }) ?? {};
  const action = event.action;

  // 액션 버튼 → 백그라운드 처리만(창 열지 않음).
  if (action === "snooze") {
    event.waitUntil(
      fetch("/api/alarms/snooze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: nd.snoozeToken }),
      }).catch(() => {}),
    );
    return;
  }
  if (action === "ack") {
    event.waitUntil(
      typeof nd.eventId === "number"
        ? fetch(`/api/events/${nd.eventId}/ack`, { method: "POST" }).catch(() => {})
        : Promise.resolve(),
    );
    return;
  }

  // 본문 탭 → 앱부터 연다. ack(알람) 은 병렬 fire-and-forget — 네트워크 await 가
  // 사용자 제스처(activation)를 잡아먹어 openWindow 가 차단되는 걸 막는다(앱 닫혀 있을 때 "안 열림"의 원인).
  const url = nd.url || "/";
  const ack =
    typeof nd.eventId === "number"
      ? fetch(`/api/events/${nd.eventId}/ack`, { method: "POST" }).catch(() => {})
      : Promise.resolve();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = wins.find((c) => "focus" in c) as WindowClient | undefined;
      if (client) {
        await client.focus().catch(() => {}); // 먼저 포커스(가장 확실한 가시 동작)
        client.navigate(url).catch(() => {}); // 이동은 best-effort(제어 안 된 창이면 실패 가능)
      } else {
        await self.clients.openWindow(url); // 열린 창 없음 → 새 창
      }
      await ack;
    })(),
  );
});
