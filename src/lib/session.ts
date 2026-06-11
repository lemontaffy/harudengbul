import type { SessionOptions } from "iron-session";

export interface SessionData {
  userId?: number;
  role?: "admin" | "member";
  username?: string;
}

// iron-session 설정. password는 SESSION_SECRET(32자 이상).
// 터널이 엣지에서 HTTPS 종료 → 브라우저는 https로 보므로 secure 쿠키 정상 동작.
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "",
  cookieName: "haru_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30일
  },
};
