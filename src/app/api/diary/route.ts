import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { completeChat, type ChatMessage } from "@/lib/llm";
import * as diaryRepo from "@/db/repo/diary";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as usageRepo from "@/db/repo/usage";

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

const itemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  amount: z.string().trim().max(50).optional(),
  weight: z.number().int().min(1).max(5).optional(),
});

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.enum(MOODS).nullable().optional(),
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
  const date = d.date ?? todayInTz(tz);

  // 1) 일기 저장(upsert) — 제공된 필드만(mood-only 호출이 본문을 지우지 않게).
  const patch: { mood?: string | null; body?: string | null } = {};
  if (d.mood !== undefined) patch.mood = d.mood;
  if (d.body !== undefined) patch.body = d.body.trim() || null;
  const entry = await diaryRepo.upsertEntry(user.id, date, patch);
  if (d.items) await diaryRepo.setItems(user.id, entry.id, d.items);

  // 2) 담당 상담가가 답장(동기). 본문 없거나 LLM 미설정이면 답장 없이 저장만.
  let reply: string | null = null;
  let replyPersona: string | null = null;
  const hasBody = !!d.body?.trim();
  const conn = await getLlmConfig(user.id);
  const counselorId = s?.diaryReplyPersonaId ?? null;
  const persona = counselorId
    ? await personasRepo.getOne(user.id, counselorId)
    : null;

  if (hasBody && conn.configured && persona && persona.isActive) {
    try {
      const ctx = await buildContext(user.id);
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
      const userTurn =
        `오늘 일기를 썼어.\n기분: ${d.mood ? MOOD_LABEL[d.mood] : "(미기록)"}\n` +
        `오늘 한 일:\n${itemsText}\n\n[일기]\n${d.body!.trim()}\n\n` +
        `— 위 일기에 1~5문장으로 따뜻하게, 상담가로서 답장해줘.`;
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(
            { name: persona.name, role: persona.role as Role, traits: persona.traits },
            ctx,
          ),
        },
        { role: "user", content: userTurn },
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
    replyUnavailable: hasBody && !reply,
  });
}
