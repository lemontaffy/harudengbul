import { verify } from "@node-rs/argon2";

// APP_PASSWORD_HASH(argon2)와 입력 비밀번호 비교.
// 해시 생성: npm run hash-password -- '비밀번호'
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    console.error("[auth] APP_PASSWORD_HASH 미설정");
    return false;
  }
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}
