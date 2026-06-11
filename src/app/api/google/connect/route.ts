import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/currentUser";
import { googleConfigured, authUrl } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin() {
  return process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
}

// Google OAuth 시작 — state 쿠키 설정 후 동의 화면으로.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin()}/login`);
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin()}/settings?google=unconfigured`);
  }
  const state = randomUUID();
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
