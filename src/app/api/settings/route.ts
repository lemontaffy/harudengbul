import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { getOpenRouterConfig, maskApiKey } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 미들웨어에서 이미 인증 검사됨.
export async function GET() {
  const cfg = await getOpenRouterConfig();
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  return Response.json({
    model: cfg.model,
    modelSource: cfg.modelSource,
    baseUrl: cfg.baseUrl,
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
    activePersona: row?.activePersona ?? "nora",
  });
}

const bodySchema = z.object({
  // 빈 문자열이면 "변경 안 함"으로 취급(키를 지우려면 명시적으로 clearApiKey 사용)
  openrouterApiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  openrouterModel: z.string().optional(),
  openrouterBaseUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
  activePersona: z.enum(["theo", "nora"]).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "잘못된 입력", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const patch: Partial<typeof settings.$inferInsert> = {};
  if (d.clearApiKey) {
    patch.openrouterApiKey = null;
  } else if (typeof d.openrouterApiKey === "string" && d.openrouterApiKey.trim() !== "") {
    patch.openrouterApiKey = d.openrouterApiKey.trim();
  }
  if (typeof d.openrouterModel === "string") {
    patch.openrouterModel = d.openrouterModel.trim() || null;
  }
  if (typeof d.openrouterBaseUrl === "string") {
    patch.openrouterBaseUrl = d.openrouterBaseUrl.trim() || null;
  }
  if (d.activePersona) {
    patch.activePersona = d.activePersona;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(settings).set(patch).where(eq(settings.id, 1));
  }

  const cfg = await getOpenRouterConfig();
  return Response.json({
    ok: true,
    model: cfg.model,
    modelSource: cfg.modelSource,
    baseUrl: cfg.baseUrl,
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
  });
}
