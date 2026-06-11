import { getCurrentUser } from "@/lib/currentUser";
import * as personasRepo from "@/db/repo/personas";
import { saveAvatar, AvatarError } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// multipart 이미지 업로드 → /data/avatars 저장 → personas.avatar_path 갱신.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const personaId = Number(id);
  if (!Number.isInteger(personaId)) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const persona = await personasRepo.getOne(user.id, personaId);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return Response.json({ error: "이미지 파일이 필요해요." }, { status: 400 });
  }

  try {
    const avatarPath = await saveAvatar(persona.id, file);
    await personasRepo.update(user.id, persona.id, { avatarPath });
    return Response.json({ ok: true, avatarPath });
  } catch (err) {
    if (err instanceof AvatarError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[avatar] upload error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
