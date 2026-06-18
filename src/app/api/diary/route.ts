import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig, pickVisionConn } from "@/lib/config";
import { captionImage } from "@/lib/caption";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { completeChat, type ChatMessage } from "@/lib/llm";
import { readDiaryPhotoDataUrl } from "@/lib/diaryPhotos";
import * as diaryRepo from "@/db/repo/diary";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as usageRepo from "@/db/repo/usage";
import { recordGrowth } from "@/modules/pets/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOODS = ["storm", "rain", "cloud", "haze", "sun"] as const;
const MOOD_LABEL: Record<string, string> = {
  storm: "폭풍(매우 힘듦)",
  rain: "비(가라앉음)",
  cloud: "흐림(그저그럼)",
  haze: "옅은 해(보통)",
  sun: "맑음(좋음)",
};
const CONDITIONS = ["sick", "tired", "normal", "energetic"] as const;
const CONDITION_LABEL: Record<string, string> = {
  sick: "아픔",
  tired: "피곤",
  normal: "보통",
  energetic: "쌩쌩",
};

const itemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  amount: z.string().trim().max(50).optional(),
  weight: z.number().int().min(1).max(5).optional(),
});

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.enum(MOODS).nullable().optional(),
  bodyCondition: z.enum(CONDITIONS).nullable().optional(),
  body: z.string().max(8000).optional(),
  items: z.array(itemSchema).max(20).optional(),
});

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

async function entryWithItems(userId: number, entry: { id: number }) {
  const items = await diaryRepo.getItems(entry.id);
  return { ...entry, items };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const entries = await diaryRepo.listByUser(user.id);
  const withItems = await Promise.all(
    entries.map((e) => entryWithItems(user.id, e)),
  );
  return Response.json({ entries: withItems });
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

  const s = await settingsRepo.getByUser(user.id);
  const tz = s?.timezone ?? "Asia/Seoul";
  // 항상 서버 기준 '오늘'로 저장 — 클라가 보낸 date 는 무시한다.
  //   (PWA 페이지를 자정 넘겨 열어두면 렌더 시점 날짜가 굳어 어제 날짜로 저장 → worker 가
  //    오늘 일기를 못 찾고 리마인드가 오발송되던 문제. 작성은 항상 '지금 그날'이므로 서버가 권위.)
  const date = todayInTz(tz);

  // 1) 일기 저장(upsert) — 제공된 필드만(mood-only 호출이 본문을 지우지 않게).
  const patch: { mood?: string | null; bodyCondition?: string | null; body?: string | null } = {};
  if (d.mood !== undefined) patch.mood = d.mood;
  if (d.bodyCondition !== undefined) patch.bodyCondition = d.bodyCondition;
  if (d.body !== undefined) patch.body = d.body.trim() || null;
  const entry = await diaryRepo.upsertEntry(user.id, date, patch);
  if (d.items) await diaryRepo.setItems(user.id, entry.id, d.items);

  // 펫 성장 이벤트 전달(펫 모듈 경계 경유, 단방향) — 일기 본문 +3 / 기분·컨디션 체크인 +1. best-effort.
  const growthPts = d.body?.trim() ? 3 : d.mood !== undefined || d.bodyCondition !== undefined ? 1 : 0;
  if (growthPts > 0) void recordGrowth(user.id, growthPts).catch(() => {});

  // 2) 담당 상담가가 답장(동기). 본문/사진 없거나 LLM 미설정이면 답장 없이 저장만.
  let reply: string | null = null;
  let replyPersona: string | null = null;
  const hasBody = !!d.body?.trim();
  const conn = await getLlmConfig(user.id);
  const counselorId = s?.diaryReplyPersonaId ?? null;
  const persona = counselorId
    ? await personasRepo.getOne(user.id, counselorId)
    : null;

  // 메인이 비전이면 사진을 직접 첨부, 아니면 보조 비전 연결(pickVisionConn)로 캡션해 인식.
  //   사진 인식 연결 선택은 채팅 캡션과 동일 경로(코드 두 벌 금지).
  const photoDataUrl =
    conn.supportsVision && entry.photoPath
      ? await readDiaryPhotoDataUrl(entry.photoPath)
      : null;
  let photoCaption: string | null = null;
  if (!photoDataUrl && entry.photoPath) {
    const vc = await pickVisionConn(user.id);
    const durl = vc ? await readDiaryPhotoDataUrl(entry.photoPath) : null;
    if (vc && durl) photoCaption = await captionImage(vc, durl);
  }
  // 사진 한 장만 남긴 날도(비전이거나 캡션이 있으면) 코멘트가 성립한다.
  const shouldReply = hasBody || !!photoDataUrl || !!photoCaption;

  if (shouldReply && conn.configured && persona && persona.isActive) {
    try {
      const ctx = await buildContext(user.id, d.body); // 일기 본문으로 의미 기억 회수
      const itemsText = (d.items ?? []).length
        ? (d.items ?? [])
            .map(
              (i) =>
                `- ${i.label}${i.amount ? ` (${i.amount})` : ""}${
                  i.weight ? ` · 체감 ${i.weight}/5` : ""
                }`,
            )
            .join("\n")
        : "(없음)";
      const condForReply = d.bodyCondition ?? entry.bodyCondition;
      const photoLine = photoDataUrl
        ? "오늘 일기에 사진도 한 장 첨부했어. 아래 이미지를 보고 느낀 걸 답장에 자연스럽게 녹여줘(사진을 길게 묘사하진 말고).\n"
        : photoCaption
          ? `오늘은 사진도 한 장 남겼어. [사진: ${photoCaption}]\n`
          : entry.photoPath
            ? "오늘은 사진도 한 장 남겼어(내용은 안 보여줘도 돼).\n"
            : "";
      const diaryBlock = hasBody ? `\n[일기]\n${d.body!.trim()}\n` : "";
      const userTurn =
        `오늘 일기를 썼어.\n기분: ${d.mood ? MOOD_LABEL[d.mood] : "(미기록)"}\n` +
        `컨디션: ${condForReply ? CONDITION_LABEL[condForReply] : "(미기록)"}\n` +
        photoLine +
        `오늘 한 일:\n${itemsText}\n` +
        diaryBlock +
        `\n— 위 기록${photoDataUrl ? "과 사진" : ""}에 1~5문장으로 따뜻하게, 상담가로서 답장해줘. ` +
        `몸이 안 좋은 날(아픔/피곤)이면 기분이 낮은 걸 너무 무겁게 받지 않도록 부드럽게 짚어줘.`;
      const userContent: ChatMessage["content"] = photoDataUrl
        ? [
            { type: "text", text: userTurn },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ]
        : userTurn;
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(
            { name: persona.name, roles: persona.roles as Role[], traits: persona.traits },
            ctx,
          ),
        },
        { role: "user", content: userContent },
      ];
      reply = (await completeChat(conn, messages, req.signal)).trim() || null;
      if (reply) {
        replyPersona = persona.name;
        await diaryRepo.setReply(user.id, entry.id, reply, replyPersona);
        await usageRepo.log(user.id, "diary_reply");
      }
    } catch (err) {
      console.error("[diary] reply error:", err);
      // 답장 실패해도 일기는 저장됨 — reply=null로 응답.
    }
  }

  const items = await diaryRepo.getItems(entry.id);
  return Response.json({
    entry: { ...entry, items, aiReply: reply ?? entry.aiReply, aiPersona: replyPersona ?? entry.aiPersona },
    reply,
    replyPersona,
    replyUnavailable: shouldReply && !reply,
  });
}
