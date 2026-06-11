import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import { saveAvatar, AvatarError } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 내 프로필 아바타 업로드 → settings.user_avatar_path 갱신.
// 세션 통과 후에만. 검증·재인코딩은 saveAvatar 가 담당(매직바이트+sharp webp).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return Response.json({ error: "이미지 파일이 필요해요." }, { status: 400 });
  }

  try {
    const avatarPath = await saveAvatar(user.id, file);
    await settingsRepo.setUserAvatar(user.id, avatarPath);
    return Response.json({ ok: true, avatarPath });
  } catch (err) {
    if (err instanceof AvatarError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[profile avatar] upload error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
