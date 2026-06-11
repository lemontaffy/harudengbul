import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig, maskApiKey } from "@/lib/config";
import { isPersona } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import type { settings as settingsTable } from "@/db/schema";

type SettingsPatch = Partial<typeof settingsTable.$inferInsert>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  activePersona: z.enum(["theo", "nora"]).optional(),
  proactiveEnabled: z.boolean().optional(),
  morningTime: z.string().regex(timeRe).optional(),
  eveningTime: z.string().regex(timeRe).optional(),
  // AI 연결 (OAI 호환)
  llmApiKey: z.string().optional(),
  clearLlmKey: z.boolean().optional(),
  llmBaseUrl: z.string().url().optional().or(z.literal("")),
  llmModel: z.string().optional(),
  // 활성(또는 지정) 페르소나의 custom_traits — 본인 것만
  customTraits: z.string().max(2000).optional(),
});

async function snapshot(userId: number) {
  const [s, llm] = await Promise.all([
    settingsRepo.getByUser(userId),
    getLlmConfig(userId),
  ]);
  return {
    activePersona: s?.activePersona ?? "nora",
    proactiveEnabled: s?.proactiveEnabled ?? false,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
    llmBaseUrl: llm.baseUrl,
    llmModel: llm.model,
    hasLlmKey: !!llm.apiKey,
    llmKeyMasked: maskApiKey(llm.apiKey),
    llmConfigured: llm.configured,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await snapshot(user.id));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const d = parsed.data;
  const set: SettingsPatch = {};

  if (d.activePersona) set.activePersona = d.activePersona;
  if (typeof d.proactiveEnabled === "boolean") set.proactiveEnabled = d.proactiveEnabled;
  if (typeof d.morningTime === "string") set.morningTime = d.morningTime;
  if (typeof d.eveningTime === "string") set.eveningTime = d.eveningTime;

  if (d.clearLlmKey) {
    set.llmApiKey = null;
  } else if (typeof d.llmApiKey === "string" && d.llmApiKey.trim() !== "") {
    set.llmApiKey = d.llmApiKey.trim();
  }
  if (typeof d.llmBaseUrl === "string") set.llmBaseUrl = d.llmBaseUrl.trim() || null;
  if (typeof d.llmModel === "string") set.llmModel = d.llmModel.trim() || null;

  if (Object.keys(set).length > 0) {
    await settingsRepo.updateByUser(user.id, set);
  }

  // custom_traits 는 대상 페르소나(지정 or 현재 활성)에 본인 것만 저장
  if (typeof d.customTraits === "string") {
    let target = d.activePersona;
    if (!isPersona(target)) {
      const cur = await settingsRepo.getByUser(user.id);
      target = isPersona(cur?.activePersona) ? cur!.activePersona : "nora";
    }
    await personasRepo.updateForUser(user.id, target, {
      customTraits: d.customTraits.trim() || null,
    });
  }

  return Response.json({ ok: true, ...(await snapshot(user.id)) });
}
