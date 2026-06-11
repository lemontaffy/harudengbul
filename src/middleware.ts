import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

// 인증 없이 접근 가능한 경로 (초대 가입 포함)
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/login",
  "/api/signup",
  "/api/health",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// 미들웨어는 Edge라 DB 접근 불가 → 세션에 userId가 있는지(coarse)만 검사.
// is_active 최종 확인은 데이터 계층(getCurrentUser)에서 한다.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const authed = !!session.userId;

  if (!authed && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 이미 로그인 상태로 로그인/가입 방문 → 홈
  if (authed && (pathname === "/login" || pathname === "/signup")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 임시 비밀번호(강제 변경) — 비번 변경 전까지 다른 경로 차단
  if (authed && session.mustChangePassword) {
    const allowed =
      pathname === "/settings" ||
      pathname === "/api/account/password" ||
      pathname === "/api/logout";
    if (!allowed && !isPublic(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "비밀번호 변경이 필요합니다." },
          { status: 403 },
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/settings";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
