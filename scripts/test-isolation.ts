// DELTA §5 교차 격리 통합 테스트.
// 사용자 2명을 만들고, A의 데이터(기억/페르소나/설정)가 B의 스코프 조회에
// 절대 섞이지 않음을 검증한다. 실패 시 비정상 종료(exit 1).
//
// 실행: DB_URL=... npx tsx scripts/test-isolation.ts
import * as usersRepo from "../src/db/repo/users";
import * as settingsRepo from "../src/db/repo/settings";
import * as personasRepo from "../src/db/repo/personas";
import * as memoriesRepo from "../src/db/repo/memories";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}`);
  if (!cond) failed++;
}

async function mkUser(username: string) {
  const u = await usersRepo.createUser({ username, passwordHash: "x", role: "member" });
  await settingsRepo.ensureForUser(u.id);
  await personasRepo.ensureForUser(u.id);
  return u;
}

async function main() {
  const suffix = process.argv[2] ?? "t";
  const A = await mkUser(`alice_${suffix}`);
  const B = await mkUser(`bob_${suffix}`);

  await memoriesRepo.add(A.id, "A의 비밀 기억: 고양이 이름은 나비", "chat", 5);
  await memoriesRepo.add(B.id, "B의 비밀 기억: 알레르기 있음", "chat", 5);

  // 1) 기억 격리 — A 조회에 B 기억 없음
  const aMem = await memoriesRepo.getForPrompt(A.id);
  check("A 기억 조회는 A 것만", aMem.every((m) => m.userId === A.id));
  check("A 기억에 B 내용 없음", !aMem.some((m) => m.content.includes("B의 비밀")));
  check("A 기억 1건 존재", aMem.length === 1);

  const bMem = await memoriesRepo.getForPrompt(B.id);
  check("B 기억에 A 내용 없음", !bMem.some((m) => m.content.includes("A의 비밀")));

  // 2) 페르소나 격리 — 각자 2인, 모두 본인 user_id
  const aPer = await personasRepo.listByUser(A.id);
  check("A 페르소나 2인", aPer.length === 2);
  check("A 페르소나 전부 A 소유", aPer.every((p) => p.userId === A.id));

  // 3) 설정 격리 + 독립성 — A만 theo로 바꿔도 B는 그대로
  await settingsRepo.updateByUser(A.id, { activePersona: "theo" });
  const aSet = await settingsRepo.getByUser(A.id);
  const bSet = await settingsRepo.getByUser(B.id);
  check("A 설정 활성=theo", aSet?.activePersona === "theo");
  check("B 설정 활성=nora(영향 없음)", bSet?.activePersona === "nora");
  check("A 설정 user_id 일치", aSet?.userId === A.id);

  console.log(failed === 0 ? "\n격리 테스트 통과 ✅" : `\n${failed}건 실패 ❌`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
