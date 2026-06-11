import { z } from "zod";
import { getSession } from "@/lib/currentUser";
import { hashPassword } from "@/lib/auth";
import * as usersRepo from "@/db/repo/users";
import * as invitesRepo from "@/db/repo/invites";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(1),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "영문/숫자/._- 만 사용"),
  password: z.string().min(8, "비밀번호는 8자 이상"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }
  const { code, username, password } = parsed.data;

  // 초대 코드 = 인증 (이메일 없음)
  const invite = await invitesRepo.findValid(code, new Date());
  if (!invite) {
    return Response.json(
      { error: "유효하지 않거나 만료된 초대 코드입니다." },
      { status: 400 },
    );
  }

  const existing = await usersRepo.findByUsername(username);
  if (existing) {
    return Response.json(
      { error: "이미 사용 중인 아이디입니다." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await usersRepo.createUser({
    username,
    passwordHash,
    role: "member",
  });

  await invitesRepo.markUsed(code, user.id);
  // settings 행 먼저 만들고 → 기본 캐릭터 2인 생성이 트리거 기본값까지 채운다.
  await settingsRepo.ensureForUser(user.id);
  await personasRepo.ensureDefaultsForUser(user.id);

  const session = await getSession();
  session.userId = user.id;
  session.role = "member";
  session.username = user.username;
  session.mustChangePassword = false;
  await session.save();

  return Response.json({ ok: true });
}
