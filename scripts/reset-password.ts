// CLI 비밀번호 복구: npm run reset-password -- <username>
// 임시 비밀번호를 발급하고(일회용, 다음 로그인 시 변경 강제) 콘솔에 출력한다.
import * as usersRepo from "../src/db/repo/users";
import { hashPassword } from "../src/lib/auth";
import { generateTempPassword } from "../src/lib/password";

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("사용법: npm run reset-password -- <username>");
    process.exit(1);
  }

  const user = await usersRepo.findByUsername(username);
  if (!user) {
    console.error(`사용자 없음: ${username}`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  await usersRepo.setPassword(user.id, hash, true);

  console.log("─".repeat(40));
  console.log(`사용자: ${username}`);
  console.log(`임시 비밀번호: ${tempPassword}`);
  console.log("다음 로그인 시 비밀번호 변경이 강제됩니다.");
  console.log("─".repeat(40));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
