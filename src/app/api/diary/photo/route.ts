import { getCurrentUser } from "@/lib/currentUser";
import { saveDiaryPhoto, DiaryPhotoError } from "@/lib/diaryPhotos";
import * as diaryRepo from "@/db/repo/diary";
import * as settingsRepo from "@/db/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// 한 줄+사진 모드 — 사진 한 장 업로드만으로 그날 일기가 성립(entry 생성/갱신).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ error: "사진 파일이 필요해요." }, { status: 400 });
  }
  const dateRaw = form?.get("date");
  const s = await settingsRepo.getByUser(user.id);
  const date =
    typeof dateRaw === "string" && dateRe.test(dateRaw)
      ? dateRaw
      : todayInTz(s?.timezone ?? "Asia/Seoul");

  try {
    const photoPath = await saveDiaryPhoto(user.id, file);
    const entry = await diaryRepo.upsertEntry(user.id, date, { photoPath });
    return Response.json({ ok: true, photoPath, date, entryId: entry.id });
  } catch (err) {
    if (err instanceof DiaryPhotoError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[diary photo] upload error:", err);
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dateRaw = new URL(req.url).searchParams.get("date");
  const s = await settingsRepo.getByUser(user.id);
  const date =
    dateRaw && dateRe.test(dateRaw)
      ? dateRaw
      : todayInTz(s?.timezone ?? "Asia/Seoul");
  await diaryRepo.upsertEntry(user.id, date, { photoPath: null });
  return Response.json({ ok: true });
}
