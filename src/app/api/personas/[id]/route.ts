import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import type { Role } from "@/lib/persona";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  role: z.enum(["counselor", "secretary"]).optional(),
  traits: z.string().max(2000).nullable().optional(),
});

async function loadOwned(userId: number, idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return null;
  return personasRepo.getOne(userId, id);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const persona = await loadOwned(user.id, id);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const d = parsed.data;

  // 역할 변경이 해당 역할의 마지막 활성 캐릭터를 0명으로 만들면 차단.
  if (d.role && d.role !== persona.role && persona.isActive) {
    const remaining = await personasRepo.countActiveByRole(
      user.id,
      persona.role as Role,
    );
    if (remaining <= 1) {
      const label = persona.role === "counselor" ? "상담가" : "비서";
      return Response.json(
        { error: `${label} 역할 캐릭터가 최소 1명은 있어야 해요.` },
        { status: 400 },
      );
    }
  }

  await personasRepo.update(user.id, persona.id, {
    name: d.name,
    role: d.role,
    traits: d.traits === undefined ? undefined : d.traits?.trim() || null,
  });
  // 역할 변경으로 트리거 담당이 역할과 안 맞게 됐을 수 있으니 보정.
  await personasRepo.normalizeSettingsForUser(user.id);

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const persona = await loadOwned(user.id, id);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  // 역할별 최소 1명 유지: 이 캐릭터가 해당 역할의 마지막 활성이면 보관 차단.
  if (persona.isActive) {
    const remaining = await personasRepo.countActiveByRole(
      user.id,
      persona.role as Role,
    );
    if (remaining <= 1) {
      const label = persona.role === "counselor" ? "상담가" : "비서";
      return Response.json(
        { error: `${label} 역할 캐릭터가 최소 1명은 있어야 해요.` },
        { status: 400 },
      );
    }
  }

  await personasRepo.archive(user.id, persona.id);
  // active/트리거가 이 캐릭터를 가리켰다면 다른 활성 캐릭터로 재지정.
  await personasRepo.normalizeSettingsForUser(user.id);

  return Response.json({ ok: true });
}
