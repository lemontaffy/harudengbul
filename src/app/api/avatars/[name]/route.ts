import { getCurrentUser } from "@/lib/currentUser";
import { readAvatar } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 아바타 서빙. 로그인 사용자만(앱 내부 이미지). 파일명 랜덤 토큰으로 열거 방지.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { name } = await params;
  const file = await readAvatar(name);
  if (!file) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.contentType,
      "cache-control": "private, max-age=86400",
    },
  });
}
