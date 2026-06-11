import { getCurrentUser } from "@/lib/currentUser";
import { readAvatarBySegments } from "@/lib/avatars";
import { avatarPathExists } from "@/db/repo/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 아바타 서빙. 로그인 사용자만. 요청 경로를 디스크에 직결하지 않고,
// DB(personas/settings)에 등록된 avatar_path 와 일치할 때만 읽는다(화이트리스트).
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

  // DB 화이트리스트 대조 — 등록되지 않은 경로는 무조건 404.
  const url = "/api/avatars/" + key.join("/");
  if (!(await avatarPathExists(url))) {
    return new Response("not found", { status: 404 });
  }

  const data = await readAvatarBySegments(key);
  if (!data) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, max-age=86400",
    },
  });
}
