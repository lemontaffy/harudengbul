// DELTA §5 + 완료 기준 교차 격리 통합 테스트.
// 사용자 2명을 만들고, A의 기억·일기·설정·캐릭터 traits·LLM 키가
// B의 repo 조회와 B의 LLM 시스템프롬프트에 절대 포함되지 않음을 검증한다.
// 실패 시 비정상 종료(exit 1).
//
// 실행: DB_URL=... npx tsx scripts/test-isolation.ts
import * as usersRepo from "../src/db/repo/users";
import * as settingsRepo from "../src/db/repo/settings";
import * as personasRepo from "../src/db/repo/personas";
import * as memoriesRepo from "../src/db/repo/memories";
import * as diaryRepo from "../src/db/repo/diary";
import { buildContext, buildSystemPrompt, type Role } from "../src/lib/persona";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}`);
  if (!cond) failed++;
}

const A_MEM = "A의 비밀 기억: 고양이 이름은 나비";
const A_DIARY = "A의 비밀 일기: 오늘 면접에서 떨었다";
const A_TRAITS = "A의 비서 캐릭터 비밀 성격: 항상 시를 인용한다";
const A_KEY = "sk-A-SECRET-KEY-9999";

async function mkUser(username: string) {
  const u = await usersRepo.createUser({
    username,
    passwordHash: "x",
    role: "member",
  });
  await settingsRepo.ensureForUser(u.id);
  await personasRepo.ensureDefaultsForUser(u.id);
  return u;
}

/** 사용자의 (역할별 첫) 활성 캐릭터 행. */
async function personaByRole(userId: number, role: Role) {
  const list = await personasRepo.listActiveByUser(userId);
  return list.find((p) => p.role === role)!;
}

async function main() {
  const suffix = process.argv[2] ?? "t";
  const A = await mkUser(`alice_${suffix}`);
  const B = await mkUser(`bob_${suffix}`);

  const aSecretary = await personaByRole(A.id, "secretary"); // A의 테오
  const bSecretary = await personaByRole(B.id, "secretary"); // B의 테오
  const bCounselor = await personaByRole(B.id, "counselor"); // B의 노라(기본 활성)

  // A에게만 데이터 주입
  await memoriesRepo.add(A.id, A_MEM, "chat", 5);
  await diaryRepo.add(A.id, "2026-06-11", A_DIARY);
  await personasRepo.update(A.id, aSecretary.id, { traits: A_TRAITS });
  await settingsRepo.updateByUser(A.id, {
    llmApiKey: A_KEY,
    llmBaseUrl: "https://a.example.com",
    llmModel: "model-a",
    activePersonaId: aSecretary.id,
  });

  // ── repo 계층 격리 ──
  const bMem = await memoriesRepo.getForPrompt(B.id);
  check("B 기억에 A 내용 없음", !bMem.some((m) => m.content.includes("A의 비밀")));

  const bDiary = await diaryRepo.listByUser(B.id);
  check("B 일기에 A 내용 없음", bDiary.length === 0);

  const bSet = await settingsRepo.getByUser(B.id);
  check("B 설정에 A의 LLM 키 없음", (bSet?.llmApiKey ?? "") !== A_KEY);
  check(
    "B 활성 캐릭터는 B 본인 것(기본 상담가)",
    bSet?.activePersonaId === bCounselor.id,
  );

  const bTheo = await personasRepo.getOne(B.id, bSecretary.id);
  check("B 비서 캐릭터 traits에 A 것 없음", (bTheo?.traits ?? "") !== A_TRAITS);
  check(
    "B는 A의 캐릭터를 조회할 수 없음(소유권)",
    (await personasRepo.getOne(B.id, aSecretary.id)) === undefined,
  );

  // ── 프롬프트 레벨 격리(핵심) ──
  const ctxB = await buildContext(B.id);
  const promptB = buildSystemPrompt(
    { name: bTheo!.name, role: bTheo!.role as Role, traits: bTheo!.traits },
    ctxB,
  );
  check("B 프롬프트에 A 기억 없음", !promptB.includes("A의 비밀 기억"));
  check("B 프롬프트에 A 일기 없음", !promptB.includes(A_DIARY));
  check("B 프롬프트에 A traits 없음", !promptB.includes(A_TRAITS));
  check("B 프롬프트에 A LLM 키 없음", !promptB.includes(A_KEY));

  // ── 양성 대조: A 본인 프롬프트엔 A 것이 들어있어야(주입 동작 확인) ──
  const ctxA = await buildContext(A.id);
  const aTheo = await personasRepo.getOne(A.id, aSecretary.id);
  const promptA = buildSystemPrompt(
    { name: aTheo!.name, role: aTheo!.role as Role, traits: aTheo!.traits },
    ctxA,
  );
  check("A 프롬프트엔 A traits 주입됨", promptA.includes(A_TRAITS));
  check("A 프롬프트엔 A 기억 주입됨", promptA.includes("A의 비밀 기억"));
  check("A 프롬프트에도 LLM 키는 미포함(키는 헤더 전용)", !promptA.includes(A_KEY));

  console.log(failed === 0 ? "\n격리 테스트 통과 ✅" : `\n${failed}건 실패 ❌`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
