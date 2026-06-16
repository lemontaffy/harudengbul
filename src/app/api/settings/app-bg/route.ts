import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import { saveAppBg, AvatarError } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 앱 배경 이미지 업로드 → settings.app_bg_path. 테마와 별개(이미지만 깔기).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "이미지 파일이 필요해요." }, { status: 400 });
  try {
    const path = await saveAppBg(user.id, file);
    await settingsRepo.updateByUser(user.id, { appBgPath: path });
    return Response.json({ ok: true, appBgPath: path });
  } catch (err) {
    if (err instanceof AvatarError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[app-bg] upload error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}

// 배경 제거 → 기본(테마 배경)으로.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await settingsRepo.updateByUser(user.id, { appBgPath: null });
  return Response.json({ ok: true });
}
