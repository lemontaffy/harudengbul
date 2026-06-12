import * as settingsRepo from "@/db/repo/settings";
import * as petsRepo from "@/db/repo/pets";
import { todayInTz } from "@/lib/proactive";

export const DAILY_CAP = 5;

/**
 * 성장 포인트 적립(전 펫 공통). 일일 상한(tz 기준 5pt) 적용. 감소 없음·부재 시 정지만.
 * 실제 적립된 양 반환. best-effort 로 호출(실패해도 본 작업 영향 없음).
 */
export async function grantGrowth(userId: number, points: number): Promise<number> {
  if (points <= 0) return 0;
  const s = await settingsRepo.getByUser(userId);
  const tz = s?.timezone ?? "Asia/Seoul";
  const today = todayInTz(tz);
  const usedToday = s?.growthDate === today ? s?.growthToday ?? 0 : 0;
  const grant = Math.max(0, Math.min(points, DAILY_CAP - usedToday));

  if (grant > 0) await petsRepo.addGrowthAll(userId, grant);
  await settingsRepo.updateByUser(userId, {
    growthDate: today,
    growthToday: usedToday + grant,
    lastActivityAt: new Date(), // 적립 = 앱 활동 → 잠 타이머 리셋
  });
  return grant;
}

/** 앱 활동 갱신(48h 잠 판정용). 펫 방 진입·채팅 등에서 호출. */
export async function bumpActivity(userId: number): Promise<void> {
  await settingsRepo.updateByUser(userId, { lastActivityAt: new Date() });
}

/** 마지막 활동이 48h 넘었는지(잠). lastActivityAt 없으면 안 잠(신규). */
export function isSleeping(lastActivityAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastActivityAt) return false;
  return now - new Date(lastActivityAt).getTime() > 48 * 60 * 60 * 1000;
}
