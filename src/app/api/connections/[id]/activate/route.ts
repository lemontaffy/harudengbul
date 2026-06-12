import { getCurrentUser } from "@/lib/currentUser";
import * as connectionsRepo from "@/db/repo/connections";
import * as settingsRepo from "@/db/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 메인 연결로 지정.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const conn = await connectionsRepo.getOne(user.id, id);
  if (!conn) return Response.json({ error: "없는 연결" }, { status: 404 });

  await settingsRepo.updateByUser(user.id, { activeConnectionId: id });
  return Response.json({ ok: true });
}
