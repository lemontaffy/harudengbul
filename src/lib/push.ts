import webpush from "web-push";
import * as pushRepo from "@/db/repo/push";

// 웹푸시(VAPID) 발송 래퍼. 키는 서버 env 에서만 읽는다.
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT (mailto: 또는 https URL; 없으면 APP_ORIGIN)

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.APP_ORIGIN?.trim() ||
    "mailto:admin@localhost";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return ensureConfigured();
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean; // true면 자동 사라지지 않고 화면에 유지(알람용)
  timestamp?: number; // 알림 표시 시각(ms). 없으면 수신 시각
}

/**
 * 사용자의 모든 구독으로 알림 발송. 만료(404/410) 구독은 자동 정리.
 * 반환: 실제 발송 성공 건수.
 */
export async function sendToUser(
  userId: number,
  payload: PushPayload,
): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await pushRepo.listByUser(userId);
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
          body,
          { urgency: "high" }, // 즉시 전달 + Android heads-up(상단 배너) 우선순위
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await pushRepo.deleteByEndpoint(s.endpoint); // 만료/해지 — 정리
        } else {
          console.error("[push] 발송 실패", code, (err as Error)?.message);
        }
      }
    }),
  );
  return sent;
}
