import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { maskApiKey } from "@/lib/config";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import * as connectionsRepo from "@/db/repo/connections";
import * as settingsRepo from "@/db/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicConn(c: connectionsRepo.ConnectionRow) {
  let key = "";
  try {
    key = decryptSecret(c.apiKey).trim();
  } catch {
    /* 미설정 취급 */
  }
  return {
    id: c.id,
    name: c.name,
    baseUrl: c.baseUrl ?? "",
    model: c.model ?? "",
    embeddingModel: c.embeddingModel ?? "",
    hasKey: !!key,
    keyMasked: maskApiKey(key),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [rows, s] = await Promise.all([
    connectionsRepo.listByUser(user.id),
    settingsRepo.getByUser(user.id),
  ]);
  return Response.json({
    connections: rows.map(publicConn),
    activeId: s?.activeConnectionId ?? null,
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  baseUrl: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  embeddingModel: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  const first = (await connectionsRepo.countByUser(user.id)) === 0;
  const row = await connectionsRepo.create(user.id, {
    name: d.name.trim(),
    apiKey: d.apiKey?.trim() ? encryptSecret(d.apiKey.trim()) : null,
    baseUrl: d.baseUrl?.trim() || null,
    model: d.model?.trim() || null,
    embeddingModel: d.embeddingModel?.trim() || null,
  });
  // 첫 연결이면 메인으로.
  if (first) await settingsRepo.updateByUser(user.id, { activeConnectionId: row.id });

  return Response.json({ connection: publicConn(row), madeActive: first });
}
