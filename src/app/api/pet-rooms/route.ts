import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(1).max(40) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "방 이름을 입력하세요." }, { status: 400 });
  const room = await roomsRepo.create(user.id, parsed.data.name);
  return Response.json({ room: { id: room.id, name: room.name } });
}
