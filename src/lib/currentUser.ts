import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import * as usersRepo from "@/db/repo/users";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export interface CurrentUser {
  id: number;
  username: string;
  role: "admin" | "member";
  mustChangePassword: boolean;
}

/**
 * 세션 → DB에서 활성 사용자 확인. 비활성/삭제 사용자는 null(즉시 차단).
 * 미들웨어(Edge)는 DB를 못 보므로 is_active 최종 검증은 여기(데이터 계층)서 한다.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await usersRepo.findActiveById(session.userId);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role as "admin" | "member",
    mustChangePassword: user.mustChangePassword,
  };
}

/** 서버 컴포넌트(페이지)용 — 미인증/비활성이면 /login 으로 리다이렉트. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
