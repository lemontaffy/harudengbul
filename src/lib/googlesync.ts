import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  listEvents,
  insertEvent,
  patchEvent,
  deleteEvent,
  fromGoogleEvent,
  toGoogleEvent,
  refreshAccess,
  SyncTokenExpired,
  type LocalEvent,
} from "@/lib/google";
import * as googleRepo from "@/db/repo/google";
import * as eventsRepo from "@/db/repo/events";
import type { GoogleAccount } from "@/db/repo/google";

/** 유효한 access token. 캐시가 1분 이상 남았으면 그대로, 아니면 refresh_token 으로 갱신·저장. */
async function freshAccessToken(account: GoogleAccount): Promise<string> {
  const exp = account.tokenExpiry ? new Date(account.tokenExpiry).getTime() : 0;
  if (account.accessToken && exp - Date.now() > 60_000) {
    return decryptSecret(account.accessToken);
  }
  const { token, expiryDate } = await refreshAccess(decryptSecret(account.refreshToken));
  await googleRepo.updateTokens(account.userId, encryptSecret(token)!, new Date(expiryDate));
  return token;
}

/** 양방향 동기화: Google→로컬(증분 pull) + 로컬 미동기분 push 보정. */
export async function syncUser(userId: number): Promise<{ pulled: number; pushed: number } | null> {
  const account = await googleRepo.getByUser(userId);
  if (!account) return null;
  const accessToken = await freshAccessToken(account);
  const calId = account.calendarId || "primary";

  // ── pull ──
  let useSync = account.syncToken;
  let fullMode = !useSync;
  let pageToken: string | undefined;
  let nextSync: string | null = null;
  let pulled = 0;
  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  while (true) {
    let res;
    try {
      res = await listEvents(
        accessToken,
        calId,
        fullMode ? { timeMin, pageToken } : { syncToken: useSync, pageToken },
      );
    } catch (err) {
      if (err instanceof SyncTokenExpired) {
        await googleRepo.setSyncToken(userId, null);
        useSync = null;
        fullMode = true;
        pageToken = undefined;
        continue;
      }
      throw err;
    }
    for (const item of res.items) {
      if (!item.id) continue;
      if (item.status === "cancelled") {
        await eventsRepo.deleteByGoogleId(userId, item.id);
      } else {
        await eventsRepo.upsertFromGoogle(userId, item.id, fromGoogleEvent(item));
        pulled++;
      }
    }
    if (res.nextPageToken) {
      pageToken = res.nextPageToken;
      continue;
    }
    nextSync = res.nextSyncToken;
    break;
  }
  if (nextSync) await googleRepo.setSyncToken(userId, nextSync);

  // ── push 보정(아직 Google에 없는 로컬 이벤트) ──
  let pushed = 0;
  for (const ev of await eventsRepo.listUnsynced(userId)) {
    try {
      const gid = await insertEvent(accessToken, calId, toGoogleEvent(ev as unknown as LocalEvent));
      await eventsRepo.setGoogleId(userId, ev.id, gid);
      pushed++;
    } catch (err) {
      console.error("[google] push 보정 실패 event", ev.id, (err as Error)?.message);
    }
  }

  await googleRepo.setLastSync(userId, new Date());
  return { pulled, pushed };
}

// ── 사용자 액션(/api/events CRUD)에서 호출하는 best-effort push ──
// 실패해도 로컬 작업은 유지하고, 다음 동기화에서 보정한다.

export async function pushCreate(
  userId: number,
  event: { id: number } & LocalEvent,
): Promise<void> {
  const account = await googleRepo.getByUser(userId);
  if (!account) return;
  try {
    const accessToken = await freshAccessToken(account);
    const gid = await insertEvent(accessToken, account.calendarId || "primary", toGoogleEvent(event));
    await eventsRepo.setGoogleId(userId, event.id, gid);
  } catch (err) {
    console.error("[google] pushCreate 실패", (err as Error)?.message);
  }
}

export async function pushUpdate(
  userId: number,
  event: { googleEventId: string | null } & LocalEvent,
): Promise<void> {
  if (!event.googleEventId) return;
  const account = await googleRepo.getByUser(userId);
  if (!account) return;
  try {
    const accessToken = await freshAccessToken(account);
    await patchEvent(accessToken, account.calendarId || "primary", event.googleEventId, toGoogleEvent(event));
  } catch (err) {
    console.error("[google] pushUpdate 실패", (err as Error)?.message);
  }
}

export async function pushDelete(userId: number, googleEventId: string | null): Promise<void> {
  if (!googleEventId) return;
  const account = await googleRepo.getByUser(userId);
  if (!account) return;
  try {
    const accessToken = await freshAccessToken(account);
    await deleteEvent(accessToken, account.calendarId || "primary", googleEventId);
  } catch (err) {
    console.error("[google] pushDelete 실패", (err as Error)?.message);
  }
}
