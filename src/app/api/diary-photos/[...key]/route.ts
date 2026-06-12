import { getCurrentUser } from "@/lib/currentUser";
import { readDiaryPhotoBySegments } from "@/lib/diaryPhotos";
import * as diaryRepo from "@/db/repo/diary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 일기 사진 서빙. 로그인 사용자만. 요청 경로를 디스크에 직결하지 않고
// DB(diary_entries.photo_path)에 등록된 경로일 때만 읽는다(화이트리스트).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { key } = await params;
  if (!Array.isArray(key) || key.length === 0) {
    return new Response("not found", { status: 404 });
  }

  const url = "/api/diary-photos/" + key.join("/");
  if (!(await diaryRepo.photoExists(url))) {
    return new Response("not found", { status: 404 });
  }

  const data = await readDiaryPhotoBySegments(key);
  if (!data) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, max-age=86400",
    },
  });
}
