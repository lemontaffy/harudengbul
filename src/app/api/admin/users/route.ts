import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as usersRepo from "@/db/repo/users";
import * as usageRepo from "@/db/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const user = await getCurrentUser();
  if (!user) return { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin")
    return { res: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET() {
  const g = await guard();
  if (g.res) return g.res;

  const [list, usage] = await Promise.all([
    usersRepo.listUsers(),
    usageRepo.countByUserSince(startOfTodayUTC()),
  ]);
  const usageMap = new Map(usage.map((u) => [u.userId, u.n]));

  return Response.json({
    users: list.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      todayUsage: usageMap.get(u.id) ?? 0,
    })),
  });
}

const toggleSchema = z.object({
  userId: z.number().int(),
  isActive: z.boolean(),
});

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;

  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  // 자기 자신 비활성화 금지(락아웃 방지)
  if (parsed.data.userId === g.user.id) {
    return Response.json(
      { error: "자기 계정은 비활성화할 수 없습니다." },
      { status: 400 },
    );
  }

  await usersRepo.setActive(parsed.data.userId, parsed.data.isActive);
  return Response.json({ ok: true });
}
