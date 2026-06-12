import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { ROLE_LABEL, REQUIRED_ROLES, validateRoles, type Role } from "@/lib/persona";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  roles: z.array(z.string()).min(1).max(3).optional(),
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

  let newRoles: Role[] | undefined;
  if (d.roles) {
    const v = validateRoles(d.roles);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    newRoles = v.roles;

    // 역할 변경으로 (시스템 의존) 역할을 잃는데 그게 마지막 활성이면 차단.
    // 신규 3종(영양사/스터디/친구)은 선택적이라 최소 인원 제약 없음.
    if (persona.isActive) {
      const losing = REQUIRED_ROLES.filter(
        (r) => persona.roles.includes(r) && !newRoles!.includes(r),
      );
      for (const r of losing) {
        if ((await personasRepo.countActiveByRole(user.id, r)) <= 1) {
          return Response.json(
            { error: `${ROLE_LABEL[r]} 역할 캐릭터가 최소 1명은 있어야 해요.` },
            { status: 400 },
          );
        }
      }
    }
  }

  await personasRepo.update(user.id, persona.id, {
    name: d.name,
    roles: newRoles,
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

  // (시스템 의존) 역할별 최소 1명 유지: 이 캐릭터가 가진 필수 역할 중 마지막 활성이면
  // 보관 차단. 신규 3종(영양사/스터디/친구)은 제약 없음.
  if (persona.isActive) {
    const required = REQUIRED_ROLES.filter((r) =>
      (persona.roles as Role[]).includes(r),
    );
    for (const r of required) {
      if ((await personasRepo.countActiveByRole(user.id, r)) <= 1) {
        return Response.json(
          { error: `${ROLE_LABEL[r]} 역할 캐릭터가 최소 1명은 있어야 해요.` },
          { status: 400 },
        );
      }
    }
  }

  await personasRepo.archive(user.id, persona.id);
  // active/트리거가 이 캐릭터를 가리켰다면 다른 활성 캐릭터로 재지정.
  await personasRepo.normalizeSettingsForUser(user.id);

  return Response.json({ ok: true });
}
