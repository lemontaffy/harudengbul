import { eq } from "drizzle-orm";
import { db } from "../client";
import { personas, settings } from "../schema";

/**
 * 주어진 public URL 이 실제 DB에 등록된 아바타 경로인지 확인(서빙 화이트리스트).
 * 캐릭터(personas.avatar_path) 또는 사용자(settings.user_avatar_path) 어느 쪽이든 일치하면 true.
 * 요청 경로를 디스크에 직결하지 않고, 이 함수로 DB와 대조한 뒤에만 파일을 읽는다.
 */
export async function avatarPathExists(url: string): Promise<boolean> {
  const [p] = await db
    .select({ id: personas.id })
    .from(personas)
    .where(eq(personas.avatarPath, url))
    .limit(1);
  if (p) return true;
  const [s] = await db
    .select({ userId: settings.userId })
    .from(settings)
    .where(eq(settings.userAvatarPath, url))
    .limit(1);
  if (s) return true;
  // 앱 배경 이미지(같은 저장소·서빙 재사용).
  const [bg] = await db
    .select({ userId: settings.userId })
    .from(settings)
    .where(eq(settings.appBgPath, url))
    .limit(1);
  return !!bg;
}
