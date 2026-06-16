import { getCurrentUser } from "@/lib/currentUser";
import * as sceneBgRepo from "@/db/repo/sceneBackgrounds";
import { saveAppBg, AvatarError } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 장면 배경 목록(관리 화면).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ backgrounds: await sceneBgRepo.listForUser(user.id) });
}

// 장면 배경 업로드 — kind(love/hostile) + 이미지. 종횡비 보존(saveAppBg 재사용).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const kindRaw = String(form?.get("kind") ?? "");
  if (kindRaw !== "love" && kindRaw !== "hostile")
    return Response.json({ error: "톤(애정/대치)을 고르세요." }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "이미지 파일이 필요해요." }, { status: 400 });
  try {
    const path = await saveAppBg(user.id, file);
    const row = await sceneBgRepo.add(user.id, kindRaw, path);
    return Response.json({ ok: true, background: row });
  } catch (err) {
    if (err instanceof AvatarError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[scene-bg] upload error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
