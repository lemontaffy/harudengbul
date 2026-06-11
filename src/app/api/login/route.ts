import { z } from "zod";
import { getSession } from "@/lib/currentUser";
import { verifyPassword } from "@/lib/auth";
import * as usersRepo from "@/db/repo/users";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const user = await usersRepo.findByUsername(parsed.data.username);
  const fail = () =>
    Response.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );

  if (!user || !user.isActive) return fail();
  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) return fail();

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role as "admin" | "member";
  session.username = user.username;
  session.mustChangePassword = user.mustChangePassword;
  await session.save();

  return Response.json({ ok: true });
}
