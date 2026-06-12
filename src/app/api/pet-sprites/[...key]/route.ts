import { getCurrentUser } from "@/lib/currentUser";
import { readSpriteBySegments, contentTypeForPath } from "@/lib/petSprites";
import { pathBelongsToUser } from "@/db/repo/petSprites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 펫 스프라이트/배경 서빙. 본인만. 요청 경로 직결 금지 — DB(pet_sprites/pet_rooms)에 등록된 path 만.
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

  const url = "/api/pet-sprites/" + key.join("/");
  if (!(await pathBelongsToUser(user.id, url))) {
    return new Response("not found", { status: 404 });
  }

  const data = await readSpriteBySegments(key);
  if (!data) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": contentTypeForPath(url),
      "cache-control": "private, max-age=86400",
    },
  });
}
