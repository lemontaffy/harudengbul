import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as lettersRepo from "@/db/repo/petLetters";
import * as repliesRepo from "@/db/repo/petLetterReplies";
import * as petsRepo from "@/db/repo/pets";
import * as settingsRepo from "@/db/repo/settings";
import { randomDeliverDelayMs } from "@/lib/petLetter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  toPetId: z.number().int().nullable().optional(), // null/미지정 = 전원에게
  content: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "편지 내용을 입력하세요." }, { status: 400 });

  const settings = await settingsRepo.getByUser(user.id);
  const tz = settings?.timezone ?? "Asia/Seoul";
  const perDay = settings?.lettersPerDay ?? 1;

  // 1일 상한.
  const today = await lettersRepo.countToday(user.id, tz);
  if (today >= perDay) {
    return Response.json({ error: "오늘 편지는 다 보냈어요. 내일 다시 쓸 수 있어요." }, { status: 429 });
  }

  // 받는 펫 결정: 지정(소유 확인) 또는 전원(사용자의 모든 펫).
  const d = parsed.data;
  let recipients: number[];
  if (d.toPetId != null) {
    const pet = await petsRepo.getOne(user.id, d.toPetId);
    if (!pet) return Response.json({ error: "없는 펫" }, { status: 400 });
    recipients = [pet.id];
  } else {
    recipients = (await petsRepo.listByUser(user.id)).map((p) => p.id);
  }
  if (recipients.length === 0) {
    return Response.json({ error: "답장할 펫이 없어요. 펫을 먼저 만들어요." }, { status: 400 });
  }

  const letter = await lettersRepo.create(user.id, d.toPetId ?? null, d.content);
  // 받는 펫마다 답장 예약(딜레이 후 워커가 생성·도착). 즉답 금지.
  const now = Date.now();
  for (const petId of recipients) {
    await repliesRepo.createPending(letter.id, petId, new Date(now + randomDeliverDelayMs()));
  }
  return Response.json({ ok: true, scheduled: recipients.length });
}
