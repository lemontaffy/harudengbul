import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getOpenRouterConfig, maskApiKey } from "@/lib/config";
import * as appConfigRepo from "@/db/repo/appConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminApi() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin")
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

function payload() {
  return getOpenRouterConfig().then((cfg) => ({
    model: cfg.modelSource === "db" ? cfg.model : "",
    modelSource: cfg.modelSource,
    baseUrl: cfg.baseUrl,
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
  }));
}

export async function GET() {
  const g = await requireAdminApi();
  if (g.error) return g.error;
  return Response.json(await payload());
}

const bodySchema = z.object({
  openrouterApiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  openrouterModel: z.string().optional(),
  openrouterBaseUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const g = await requireAdminApi();
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const d = parsed.data;

  const patch: Record<string, string | null> = {};
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

  if (Object.keys(patch).length > 0) {
    await appConfigRepo.ensure();
    await appConfigRepo.update(patch);
  }
  return Response.json({ ok: true, ...(await payload()) });
}
