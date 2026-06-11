import { hash } from "@node-rs/argon2";

// 사용법: npm run hash-password -- '내비밀번호'
// 출력된 해시를 .env 의 APP_PASSWORD_HASH 에 넣는다.
async function main() {
  const pw = process.argv[2];
  if (!pw) {
    console.error("사용법: npm run hash-password -- '비밀번호'");
    process.exit(1);
  }
  const h = await hash(pw);
  console.log(h);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
