import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig, maskApiKey } from "@/lib/config";
import { encryptSecret } from "@/lib/crypto";
import { latLonToGrid } from "@/lib/weather";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import type { settings as settingsTable } from "@/db/schema";

type SettingsPatch = Partial<typeof settingsTable.$inferInsert>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  proactiveEnabled: z.boolean().optional(),
  handoffEnabled: z.boolean().optional(),
  morningTime: z.string().regex(timeRe).optional(),
  eveningTime: z.string().regex(timeRe).optional(),
  // AI 연결 (OAI 호환)
  llmApiKey: z.string().optional(),
  clearLlmKey: z.boolean().optional(),
  llmBaseUrl: z.string().url().optional().or(z.literal("")),
  llmModel: z.string().optional(),
  llmEmbeddingModel: z.string().optional(),
  // 내 프로필
  nickname: z.string().max(40).optional(),
  about: z.string().max(1000).optional(),
  // 위치(날씨용) — 좌표를 받아 서버에서 기상청 격자 nx/ny 도출
  locationLat: z.number().min(-90).max(90).optional(),
  locationLon: z.number().min(-180).max(180).optional(),
  // 캐릭터 할당 (채팅 활성 + 트리거별 담당). 본인 소유 + 역할 적합성 검증.
  activePersonaId: z.number().int().optional(),
  diaryReplyPersonaId: z.number().int().optional(),
  morningPersonaId: z.number().int().optional(),
  eveningPersonaId: z.number().int().optional(),
  diaryReminderPersonaId: z.number().int().optional(),
  // 일기 리마인드
  diaryReminderEnabled: z.boolean().optional(),
  diaryReminderTime: z.string().regex(timeRe).optional(),
});

async function snapshot(userId: number) {
  const [s, llm] = await Promise.all([
    settingsRepo.getByUser(userId),
    getLlmConfig(userId),
  ]);
  return {
    nickname: s?.nickname ?? "",
    about: s?.about ?? "",
    userAvatarPath: s?.userAvatarPath ?? null,
    activePersonaId: s?.activePersonaId ?? null,
    diaryReplyPersonaId: s?.diaryReplyPersonaId ?? null,
    morningPersonaId: s?.morningPersonaId ?? null,
    eveningPersonaId: s?.eveningPersonaId ?? null,
    diaryReminderPersonaId: s?.diaryReminderPersonaId ?? null,
    diaryReminderEnabled: s?.diaryReminderEnabled ?? false,
    diaryReminderTime: s?.diaryReminderTime ?? "21:30",
    proactiveEnabled: s?.proactiveEnabled ?? false,
    handoffEnabled: s?.handoffEnabled ?? true,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
    locationLat: s?.locationLat != null ? Number(s.locationLat) : null,
    locationLon: s?.locationLon != null ? Number(s.locationLon) : null,
    hasLocation: s?.kmaNx != null && s?.kmaNy != null,
    llmBaseUrl: llm.baseUrl,
    llmModel: llm.model,
    llmEmbeddingModel: s?.llmEmbeddingModel ?? "",
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

  if (typeof d.proactiveEnabled === "boolean") set.proactiveEnabled = d.proactiveEnabled;
  if (typeof d.handoffEnabled === "boolean") set.handoffEnabled = d.handoffEnabled;
  if (typeof d.morningTime === "string") set.morningTime = d.morningTime;
  if (typeof d.eveningTime === "string") set.eveningTime = d.eveningTime;
  if (typeof d.diaryReminderEnabled === "boolean") set.diaryReminderEnabled = d.diaryReminderEnabled;
  if (typeof d.diaryReminderTime === "string") set.diaryReminderTime = d.diaryReminderTime;

  if (d.clearLlmKey) {
    set.llmApiKey = null;
  } else if (typeof d.llmApiKey === "string" && d.llmApiKey.trim() !== "") {
    // 키는 평문으로 DB에 두지 않는다 — 저장 직전 암호화.
    set.llmApiKey = encryptSecret(d.llmApiKey.trim());
  }
  if (typeof d.llmBaseUrl === "string") set.llmBaseUrl = d.llmBaseUrl.trim() || null;
  if (typeof d.llmModel === "string") set.llmModel = d.llmModel.trim() || null;
  if (typeof d.llmEmbeddingModel === "string")
    set.llmEmbeddingModel = d.llmEmbeddingModel.trim() || null;

  if (typeof d.nickname === "string") set.nickname = d.nickname.trim() || null;
  if (typeof d.about === "string") set.about = d.about.trim() || null;

  // 위치: 좌표가 둘 다 오면 격자(nx/ny) 도출해 함께 저장(numeric 컬럼 → 문자열).
  if (typeof d.locationLat === "number" && typeof d.locationLon === "number") {
    const { nx, ny } = latLonToGrid(d.locationLat, d.locationLon);
    set.locationLat = String(d.locationLat);
    set.locationLon = String(d.locationLon);
    set.kmaNx = nx;
    set.kmaNy = ny;
  }

  // 캐릭터 id 들: 본인 소유 + 활성 + (트리거면) 역할 적합성 검증.
  //   active = 아무 역할, diary_reply·evening = counselor, morning = secretary.
  const assign: [number | undefined, keyof SettingsPatch, Role | null, string][] = [
    [d.activePersonaId, "activePersonaId", null, "활성"],
    [d.diaryReplyPersonaId, "diaryReplyPersonaId", "counselor", "일기 답장"],
    [d.morningPersonaId, "morningPersonaId", "secretary", "아침"],
    [d.eveningPersonaId, "eveningPersonaId", "counselor", "저녁"],
    [d.diaryReminderPersonaId, "diaryReminderPersonaId", "counselor", "일기 리마인드"],
  ];
  for (const [id, key, role, label] of assign) {
    if (id === undefined) continue;
    const p = await personasRepo.getOne(user.id, id);
    if (!p || !p.isActive) {
      return Response.json({ error: `${label} 담당 캐릭터가 올바르지 않아요.` }, { status: 400 });
    }
    if (role && p.role !== role) {
      const need = role === "counselor" ? "상담가" : "비서";
      return Response.json(
        { error: `${label} 담당은 ${need} 역할이어야 해요.` },
        { status: 400 },
      );
    }
    (set[key] as number) = id;
  }

  if (Object.keys(set).length > 0) {
    await settingsRepo.updateByUser(user.id, set);
  }

  return Response.json({ ok: true, ...(await snapshot(user.id)) });
}
