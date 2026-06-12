import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as capsulesRepo from "@/db/repo/timeCapsules";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  deliverOn: z.string().regex(dateRe),
  personaId: z.number().int().nullable().optional(),
});

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 편지 작성 → 봉인. 도착일은 최소 내일 이후.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  if (d.deliverOn <= todayKst()) {
    return Response.json({ error: "도착일은 내일 이후로 정해주세요." }, { status: 400 });
  }

  // 배달 캐릭터는 본인 소유 활성 페르소나여야 함(없으면 null 허용 → 배달 시 폴백).
  let personaId: number | null = null;
  if (d.personaId != null) {
    const p = await personasRepo.getOne(user.id, d.personaId);
    if (!p || !p.isActive) {
      return Response.json({ error: "배달 캐릭터를 다시 선택해주세요." }, { status: 400 });
    }
    personaId = p.id;
  }

  const row = await capsulesRepo.create(user.id, {
    personaId,
    content: d.content,
    deliverOn: d.deliverOn,
  });
  return Response.json({
    capsule: { id: row.id, deliverOn: row.deliverOn, createdAt: row.createdAt, personaId },
  });
}
