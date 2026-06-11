import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";
import * as usersRepo from "@/db/repo/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.number().int() });

// 멤버 비밀번호 초기화 → 일회용 임시 비밀번호 1회 반환(must_change_password=true).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "잘못된 입력" }, { status: 400 });

  if (parsed.data.userId === me.id) {
    return Response.json(
      { error: "본인 비밀번호는 설정의 '비밀번호 변경'을 사용하세요." },
      { status: 400 },
    );
  }

  const target = await usersRepo.findById(parsed.data.userId);
  if (!target) return Response.json({ error: "없는 사용자" }, { status: 404 });

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  await usersRepo.setPassword(target.id, hash, true);

  return Response.json({
    ok: true,
    username: target.username,
    tempPassword, // 1회 노출 — 관리자가 멤버에게 전달
  });
}
