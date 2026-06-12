import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { decryptSecret } from "@/lib/crypto";
import { fetchModels } from "@/lib/models";
import * as connectionsRepo from "@/db/repo/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 모델 자동 검색. base_url 은 필수, 키는 본문(새 연결) 또는 저장된 연결(connectionId)에서.
const schema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  connectionId: z.number().int().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Base URL이 필요해요.", models: [] }, { status: 400 });
  }
  const d = parsed.data;

  let key = d.apiKey?.trim() || "";
  if (!key && d.connectionId) {
    const c = await connectionsRepo.getOne(user.id, d.connectionId);
    try {
      key = decryptSecret(c?.apiKey).trim();
    } catch {
      key = "";
    }
  }
  if (!key) {
    return Response.json(
      { error: "API 키가 필요해요(키를 입력하거나 저장 후 시도).", models: [] },
      { status: 400 },
    );
  }

  try {
    const { source, models, cached } = await fetchModels(d.baseUrl, key);
    return Response.json({ source, models, cached });
  } catch {
    return Response.json(
      { error: "모델 목록을 가져오지 못했어요. 모델명을 직접 입력하세요.", models: [] },
      { status: 502 },
    );
  }
}
