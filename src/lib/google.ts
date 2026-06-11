import { OAuth2Client } from "google-auth-library";

// Google Calendar 연동 — OAuth(google-auth-library) + Calendar v3 REST(fetch).
// 토큰 영속/암호화는 repo/googlesync 가 담당. 여기는 OAuth 클라이언트·REST·순수 매핑만.

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function redirectUri(): string {
  const origin = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  return `${origin}/api/google/callback`;
}

export function oauth(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID?.trim(),
    process.env.GOOGLE_CLIENT_SECRET?.trim(),
    redirectUri(),
  );
}

export function authUrl(state: string): string {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // refresh_token 확보
    scope: SCOPES,
    state,
  });
}

export interface ExchangedTokens {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
  email: string | null;
}

export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const { tokens } = await oauth().getToken(code);
  let email: string | null = null;
  if (tokens.access_token) {
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (r.ok) email = (await r.json())?.email ?? null;
    } catch {
      /* 이메일은 표시용 — 실패 무시 */
    }
  }
  return {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    email,
  };
}

/** refresh_token 으로 새 access token. {token, expiryDate}. */
export async function refreshAccess(refreshToken: string): Promise<{ token: string; expiryDate: number }> {
  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("access token 갱신 실패");
  const expiryDate = client.credentials.expiry_date ?? Date.now() + 3500_000;
  return { token, expiryDate };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    /* best-effort */
  }
}

// ── Calendar REST ──
export class SyncTokenExpired extends Error {}

interface GEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
}

async function calFetch(
  accessToken: string,
  calId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${CAL_BASE}/${encodeURIComponent(calId)}/events${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function listEvents(
  accessToken: string,
  calId: string,
  opts: { syncToken?: string | null; timeMin?: string; pageToken?: string },
): Promise<{ items: GEvent[]; nextSyncToken: string | null; nextPageToken: string | null }> {
  const qs = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
  if (opts.pageToken) qs.set("pageToken", opts.pageToken);
  if (opts.syncToken) qs.set("syncToken", opts.syncToken);
  else if (opts.timeMin) qs.set("timeMin", opts.timeMin);

  const res = await calFetch(accessToken, calId, `?${qs}`);
  if (res.status === 410) throw new SyncTokenExpired(); // syncToken 만료 → full 재시도
  if (!res.ok) throw new Error(`calendar list ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return {
    items: json.items ?? [],
    nextSyncToken: json.nextSyncToken ?? null,
    nextPageToken: json.nextPageToken ?? null,
  };
}

export async function insertEvent(accessToken: string, calId: string, body: object): Promise<string> {
  const res = await calFetch(accessToken, calId, "", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`calendar insert ${res.status}`);
  return (await res.json()).id as string;
}

export async function patchEvent(accessToken: string, calId: string, gid: string, body: object): Promise<void> {
  const res = await calFetch(accessToken, calId, `/${encodeURIComponent(gid)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) throw new Error(`calendar patch ${res.status}`);
}

export async function deleteEvent(accessToken: string, calId: string, gid: string): Promise<void> {
  const res = await calFetch(accessToken, calId, `/${encodeURIComponent(gid)}`, { method: "DELETE" });
  // 404/410 = 이미 없음 → 성공으로 취급
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`calendar delete ${res.status}`);
}

// ── 순수 매핑 (테스트용) ──
export interface LocalEventPatch {
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  alarmMinutesBefore: number | null;
}

export function fromGoogleEvent(g: GEvent): LocalEventPatch {
  const title = g.summary?.trim() || "(제목 없음)";
  const startStr = g.start?.dateTime ?? g.start?.date ?? null;
  const endStr = g.end?.dateTime ?? g.end?.date ?? null;
  const startsAt = startStr ? new Date(startStr) : new Date();
  const endsAt = endStr ? new Date(endStr) : null;
  let alarm: number | null = null;
  const ov = g.reminders?.overrides?.find((o) => o.method === "popup") ?? g.reminders?.overrides?.[0];
  if (ov && typeof ov.minutes === "number") alarm = ov.minutes;
  return { title, startsAt, endsAt, alarmMinutesBefore: alarm };
}

export interface LocalEvent {
  title: string;
  startsAt: Date | string;
  endsAt: Date | string | null;
  alarmMinutesBefore: number | null;
}

export function toGoogleEvent(e: LocalEvent): object {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const body: Record<string, unknown> = {
    summary: e.title,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Seoul" },
  };
  body.reminders =
    e.alarmMinutesBefore != null
      ? { useDefault: false, overrides: [{ method: "popup", minutes: e.alarmMinutesBefore }] }
      : { useDefault: true };
  return body;
}
