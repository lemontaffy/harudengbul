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
import * as messagesRepo from "../src/db/repo/messages";
import * as petRoomsRepo from "../src/db/repo/petRooms";
import * as petItemsLibRepo from "../src/db/repo/items";
import * as placementsRepo from "../src/db/repo/furniturePlacements";
import * as roomItemsRepo from "../src/db/repo/roomItems";
import * as momentsRepo from "../src/db/repo/petMoments";
import * as preordersRepo from "../src/db/repo/preorders";
import { buildContext, buildSystemPrompt, type Role } from "../src/lib/persona";
import { executeTool } from "../src/lib/tools";

async function search(userId: number, query: string, personaId: number) {
  return executeTool(userId, "search_past_messages", JSON.stringify({ query }), {
    personaId,
  });
}

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
  return list.find((p) => p.roles.includes(role))!;
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
  await diaryRepo.upsertEntry(A.id, "2026-06-11", { body: A_DIARY });
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
    { name: bTheo!.name, roles: bTheo!.roles as Role[], traits: bTheo!.traits },
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
    { name: aTheo!.name, roles: aTheo!.roles as Role[], traits: aTheo!.traits },
    ctxA,
  );
  check("A 프롬프트엔 A traits 주입됨", promptA.includes(A_TRAITS));
  check("A 프롬프트엔 A 기억 주입됨", promptA.includes("A의 비밀 기억"));
  check("A 프롬프트에도 LLM 키는 미포함(키는 헤더 전용)", !promptA.includes(A_KEY));

  // ── 메시지 소유 검증(재생성/삭제 라우트의 스코프) ──
  const aMsg = await messagesRepo.add(A.id, aSecretary.id, "assistant", "A의 비밀 답장");
  check("B는 A 메시지를 조회 못 함", (await messagesRepo.getOne(B.id, aMsg.id)) === undefined);
  await messagesRepo.remove(B.id, aMsg.id); // 타인 스코프 → no-op
  check("B의 remove로 A 메시지 안 지워짐", !!(await messagesRepo.getOne(A.id, aMsg.id)));
  const aUser = await messagesRepo.add(A.id, aSecretary.id, "user", "A의 질문");
  check(
    "B의 쌍삭제 거부(소유 아님)",
    (await messagesRepo.removeUserWithResponses(B.id, aUser.id)) === false,
  );
  check("A user 메시지 여전히 존재", !!(await messagesRepo.getOne(A.id, aUser.id)));

  // ── 첨부 사진 서빙 화이트리스트: userId 스코프(교차 유저 차단) ──
  const A_UPLOAD = `/api/uploads/${A.id}/secret-photo.jpg`;
  await messagesRepo.add(A.id, aSecretary.id, "user", "사진", false, A_UPLOAD);
  check("A 본인은 자기 첨부 경로 서빙 허용", await messagesRepo.attachmentPathExists(A_UPLOAD, A.id));
  check(
    "B는 A 첨부 경로 서빙 불가(교차 유저 차단)",
    (await messagesRepo.attachmentPathExists(A_UPLOAD, B.id)) === false,
  );

  // ── 과거 대화 검색: 교차 유저 격리 ──
  await messagesRepo.add(A.id, aSecretary.id, "user", "A만의 검색키워드 SEARCHSECRET_A 회사 얘기");
  const bSearchOfA = await messagesRepo.searchMessages(B.id, "SEARCHSECRET_A");
  check("B 검색에 A 메시지 안 나옴(유저 격리)", bSearchOfA.length === 0);
  const aSearchOwn = await messagesRepo.searchMessages(A.id, "SEARCHSECRET_A");
  check("A 검색엔 A 본인 메시지 나옴(양성 대조)", aSearchOwn.length > 0);

  // ── 과거 대화 검색: 상담 격리(도구 핸들러 단위, 프롬프트 회귀 면역) ──
  // B의 상담가(노라) 방·비서(테오) 방에 각각 전용 키워드 메시지를 심는다.
  const KW_COUNSELOR = "노라방전용키워드_CONFESSION";
  const KW_SECRETARY = "테오방전용키워드_SCHEDULE";
  await messagesRepo.add(B.id, bCounselor.id, "user", `상담방에서만 말함: ${KW_COUNSELOR}`);
  await messagesRepo.add(B.id, bSecretary.id, "user", `비서방에서만 말함: ${KW_SECRETARY}`);

  // 핵심 역검증: 비서(테오)는 상담가(노라) 방의 키워드를 절대 못 찾는다.
  const secSeesCounselor = await search(B.id, KW_COUNSELOR, bSecretary.id);
  check(
    "비서 검색에 상담방 키워드 절대 미노출(상담 격리)",
    !secSeesCounselor.includes(KW_COUNSELOR),
  );
  // 상담가(노라)는 자기 방의 그 키워드를 찾는다(양성 대조).
  const counSeesOwn = await search(B.id, KW_COUNSELOR, bCounselor.id);
  check("상담가는 자기 방 과거 내용을 찾음", counSeesOwn.includes(KW_COUNSELOR));
  // 상담가는 자기 방만(onlyPersonaId) — 비서 방 키워드는 못 본다.
  const counSeesSecretary = await search(B.id, KW_SECRETARY, bCounselor.id);
  check(
    "상담가 검색에 비서방 키워드 미노출(자기 방만)",
    !counSeesSecretary.includes(KW_SECRETARY),
  );
  // 비서는 비-상담 방(자기 방 포함) 키워드는 찾는다(양성 대조).
  const secSeesOwn = await search(B.id, KW_SECRETARY, bSecretary.id);
  check("비서는 비-상담 방 과거 내용을 찾음", secSeesOwn.includes(KW_SECRETARY));

  // 형식: 결과는 'YYYY-MM-DD | 발화자 | …' (날짜 동반 인용 가능 — 수동①).
  check(
    "검색 결과에 날짜(YYYY-MM-DD)가 포함됨",
    /^\d{4}-\d{2}-\d{2} \| /.test(counSeesOwn),
  );
  // 없는 내용은 지어내지 않고 '결과 없음'(수동②).
  const noHit = await search(B.id, "절대존재하지않는키워드_ZZZQQQ999", bSecretary.id);
  check("없는 내용 검색은 '결과 없음'", noHit === "결과 없음");

  // ── 펫 룸: 전역 아이템 라이브러리(items) + 방 배치(furniture_placements) 교차 격리 ──
  const aRoom = await petRoomsRepo.create(A.id, "A의 비밀 방");
  const A_ITEM_SPRITE = `/api/pet-sprites/${A.id}/secret-item.png`;
  const aItem = await petItemsLibRepo.add(A.id, {
    name: "A비밀아이템",
    kind: "item",
    spritePath: A_ITEM_SPRITE,
    durabilityMax: 10,
    durabilityNow: 10,
  });
  await placementsRepo.add({ roomId: aRoom.id, itemId: aItem.id, posX: 50, posY: 50 });

  const bLib = await petItemsLibRepo.listForUser(B.id);
  check("B 라이브러리에 A 아이템 없음", !bLib.some((i) => i.id === aItem.id));
  check("B는 A 아이템 조회 못 함(소유)", (await petItemsLibRepo.getOne(B.id, aItem.id)) === null);
  const bRooms = await petRoomsRepo.listByUser(B.id);
  check("B 방 목록에 A방 없음", !bRooms.some((r) => r.id === aRoom.id));
  const bPlacements = await placementsRepo.listForRoom(B.id, aRoom.id);
  check("B는 A방 배치 조회 못 함(룸 소유 스코프)", bPlacements.length === 0);
  check("A 본인은 A방 배치 조회됨(양성 대조)", (await placementsRepo.listForRoom(A.id, aRoom.id)).length === 1);
  check("A 본인 아이템 스프라이트 서빙 허용", await petItemsLibRepo.pathBelongsToUser(A.id, A_ITEM_SPRITE));
  check("B는 A 아이템 스프라이트 서빙 불가(교차 차단)", (await petItemsLibRepo.pathBelongsToUser(B.id, A_ITEM_SPRITE)) === false);
  // 내구도 wear/repair 타 유저 스코프 무동작.
  await petItemsLibRepo.wear(B.id, aItem.id); // 타인 → 무동작
  check("B의 wear로 A 아이템 내구도 안 줄어듦", (await petItemsLibRepo.getOne(A.id, aItem.id))?.durabilityNow === 10);

  // ── v6 방 인스턴스(room_items): 상태(내구도·소유·placed)는 인스턴스, 교차 격리 ──
  const aInst = await roomItemsRepo.pull({ roomId: aRoom.id, assetId: aItem.id, durabilityMax: 10, placed: true });
  check("A방 인스턴스 생성됨(placed)", (await roomItemsRepo.listForRoom(A.id, aRoom.id)).length === 1);
  check("B는 A방 인스턴스 조회 못 함", (await roomItemsRepo.listForRoom(B.id, aRoom.id)).length === 0);
  check("B는 A 인스턴스 단건 조회 못 함", (await roomItemsRepo.getOne(B.id, aInst.id)) === null);
  await roomItemsRepo.wear(B.id, aInst.id); // 타인 → 무동작
  check("B의 wear로 A 인스턴스 내구도 안 줄어듦", (await roomItemsRepo.getOne(A.id, aInst.id))?.durabilityNow === 10);
  await roomItemsRepo.remove(B.id, aInst.id); // 타인 → 무동작
  check("B의 remove로 A 인스턴스 안 지워짐", (await roomItemsRepo.getOne(A.id, aInst.id)) !== null);

  // ── 관계 이벤트 순간(pet_moments) 교차 격리 ──
  const aMoment = await momentsRepo.create(A.id, {
    roomId: aRoom.id,
    petAId: null, // FK set null 허용 — 이름 스냅샷으로 재생(실제 펫 불요)
    petBId: null,
    petAName: "A펫1",
    petBName: "A펫2",
    relationKind: "hostile",
    script: [{ type: "narrator", text: "A의 비밀 씬" }],
  });
  check("B는 A 순간 조회 못 함", (await momentsRepo.getOne(B.id, aMoment.id)) === null);
  check("B 순간 목록에 A 것 없음", !(await momentsRepo.listForUser(B.id)).some((m) => m.id === aMoment.id));
  check("A 본인은 A 순간 조회됨(양성)", (await momentsRepo.getOne(A.id, aMoment.id)) !== null);

  // ── 예약·잔금(preorders) 교차 격리 ──
  const aPre = await preordersRepo.create(A.id, {
    name: "A비밀예약",
    depositKrw: 1000,
    depositDate: "2026-06-01",
    balanceKrwEstimate: 5000,
    balanceDueDate: "2026-07-01",
  });
  check("B는 A 예약 조회 못 함", (await preordersRepo.getOne(B.id, aPre.id)) === undefined);
  check("B 예약 목록에 A 것 없음", !(await preordersRepo.listByUser(B.id)).some((p) => p.id === aPre.id));
  check("A 본인은 A 예약 조회됨(양성)", (await preordersRepo.getOne(A.id, aPre.id)) !== undefined);
  await preordersRepo.remove(B.id, aPre.id); // 타인 스코프 → no-op
  check("B의 remove로 A 예약 안 지워짐", (await preordersRepo.getOne(A.id, aPre.id)) !== undefined);

  console.log(failed === 0 ? "\n격리 테스트 통과 ✅" : `\n${failed}건 실패 ❌`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
