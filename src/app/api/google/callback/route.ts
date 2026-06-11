import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/currentUser";
import { exchangeCode } from "@/lib/google";
import { encryptSecret } from "@/lib/crypto";
import * as googleRepo from "@/db/repo/google";
import { syncUser } from "@/lib/googlesync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin() {
  return process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin()}/login`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = (await cookies()).get("g_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin()}/settings?google=error`);
  }

  try {
    const t = await exchangeCode(code);
    if (!t.refreshToken) {
      // 이미 동의해 refresh_token 미발급 — 구글 계정 권한 페이지에서 앱 제거 후 재시도 필요
      return NextResponse.redirect(`${origin()}/settings?google=norefresh`);
    }
    await googleRepo.upsert(user.id, {
      refreshToken: encryptSecret(t.refreshToken)!,
      accessToken: t.accessToken ? encryptSecret(t.accessToken) : null,
      tokenExpiry: t.expiryDate ? new Date(t.expiryDate) : null,
      email: t.email,
    });
    await syncUser(user.id).catch((e) => console.error("[google] 초기 동기화", e?.message));
  } catch (err) {
    console.error("[google] callback 실패:", (err as Error)?.message);
    return NextResponse.redirect(`${origin()}/settings?google=error`);
  }

  const res = NextResponse.redirect(`${origin()}/settings?google=connected`);
  res.cookies.delete("g_oauth_state");
  return res;
}
