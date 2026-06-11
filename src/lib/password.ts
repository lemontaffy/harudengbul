import { randomBytes } from "node:crypto";

// 읽기 쉬운 12자 임시 비밀번호(관리자 초기화 / CLI 복구용).
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url"); // 12 chars
}
