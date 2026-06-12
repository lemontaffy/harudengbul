import { getCurrentUser } from "@/lib/currentUser";
import { saveUpload, UploadError } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 채팅 첨부 사진 업로드 — 검증·재인코딩(EXIF 제거) 후 경로 반환. 전송은 /api/chat 에서.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ error: "사진 파일이 필요해요." }, { status: 400 });
  }
  try {
    const path = await saveUpload(user.id, file);
    return Response.json({ ok: true, path });
  } catch (err) {
    if (err instanceof UploadError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[chat upload] error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
