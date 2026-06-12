import { getCurrentUser } from "@/lib/currentUser";
import { readUploadBySegments } from "@/lib/uploads";
import { attachmentPathExists } from "@/db/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 채팅 첨부 서빙 — 로그인 사용자만. 디스크 직결 금지: DB(messages.attachment_path)
// 화이트리스트에 등록된 경로일 때만 읽는다.
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
  const url = "/api/uploads/" + key.join("/");
  if (!(await attachmentPathExists(url, user.id))) {
    return new Response("not found", { status: 404 });
  }
  const data = await readUploadBySegments(key);
  if (!data) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=86400",
    },
  });
}
