import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as invitesRepo from "@/db/repo/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const user = await getCurrentUser();
  if (!user) return { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin")
    return { res: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

function signupBase(req: Request): string {
  return process.env.APP_ORIGIN?.trim() || new URL(req.url).origin;
}

export async function GET(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  const base = signupBase(req);
  const open = await invitesRepo.listOpen(new Date());
  return Response.json({
    invites: open.map((i) => ({
      ...i,
      url: `${base}/signup?code=${i.code}`,
    })),
  });
}

const issueSchema = z.object({ days: z.number().int().min(1).max(90).optional() });

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;

  const body = await req.json().catch(() => ({}));
  const parsed = issueSchema.safeParse(body ?? {});
  const days = parsed.success ? (parsed.data.days ?? 7) : 7;

  const code = randomBytes(18).toString("base64url"); // 24자
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await invitesRepo.issue({ code, createdBy: g.user.id, expiresAt });

  return Response.json({
    ok: true,
    code,
    expiresAt,
    url: `${signupBase(req)}/signup?code=${code}`,
  });
}

export async function DELETE(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return Response.json({ error: "code 필요" }, { status: 400 });
  await invitesRepo.cancel(code);
  return Response.json({ ok: true });
}
