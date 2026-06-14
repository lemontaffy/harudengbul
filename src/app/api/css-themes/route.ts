import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as cssThemesRepo from "@/db/repo/cssThemes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ themes: await cssThemesRepo.listForUser(user.id) });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  css: z.string().max(20480), // 20KB
});

// 현재 CSS 를 이름 붙여 보관함에 저장.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "이름과 CSS를 확인하세요." }, { status: 400 });
  const row = await cssThemesRepo.create(user.id, parsed.data.name, parsed.data.css);
  if (!row) return Response.json({ error: "보관함이 가득 찼어요(최대 30개)." }, { status: 409 });
  return Response.json({ theme: row });
}
