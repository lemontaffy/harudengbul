import { z } from "zod";
import { getCurrentUser, getSession } from "@/lib/currentUser";
import { verifyPassword, hashPassword } from "@/lib/auth";
import * as usersRepo from "@/db/repo/users";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "새 비밀번호는 8자 이상"),
});

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  const user = await usersRepo.findById(me.id);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ok = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!ok) {
    return Response.json(
      { error: "현재 비밀번호가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await usersRepo.setPassword(me.id, newHash, false);

  // 세션의 강제변경 플래그 해제
  const session = await getSession();
  session.mustChangePassword = false;
  await session.save();

  return Response.json({ ok: true });
}
