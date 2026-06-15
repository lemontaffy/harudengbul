// 하루등불 worker 엔트리포인트 — node-cron 잡.
//   alarmJob(매 1분): 알람 시각 도달한 일정에 웹푸시 → alarm_sent=true (청구 후 발송).
//   weatherJob(매시): 사용자 격자별 기상청/OWM 조회 → weather_cache 갱신.
//   proactive/memory/backup 잡은 다음 단계.
// app과 src/db, src/lib 코드를 공유하지만 프로세스를 분리해 중복 실행을 막는다.
import cron from "node-cron";
import * as eventsRepo from "../src/db/repo/events";
import * as weatherRepo from "../src/db/repo/weather";
import * as settingsRepo from "../src/db/repo/settings";
import * as personasRepo from "../src/db/repo/personas";
import * as messagesRepo from "../src/db/repo/messages";
import * as diaryRepo from "../src/db/repo/diary";
import * as memoriesRepo from "../src/db/repo/memories";
import * as handoffsRepo from "../src/db/repo/handoffs";
import * as achievementSuggRepo from "../src/db/repo/achievementSuggestions";
import * as googleRepo from "../src/db/repo/google";
import * as capsulesRepo from "../src/db/repo/timeCapsules";
import * as memosRepo from "../src/db/repo/memos";
import * as usageRepo from "../src/db/repo/usage";
import * as petsRepo from "../src/db/repo/pets";
import * as petRelationsRepo from "../src/db/repo/petRelations";
import * as letterRepliesRepo from "../src/db/repo/petLetterReplies";
import {
  buildReplyMessages,
  buildMemoryExtractMessages,
  sanitizePetMemory,
  fallbackReply,
  REPLY_SAMPLING,
  type ReplyRelation,
} from "../src/lib/petLetter";
import { recallPetMemories, savePetMemory } from "../src/lib/petMemory";
import { getLetterConfig } from "../src/lib/config";
import { getPetBriefingLine } from "../src/modules/pets/boundary";
import {
  composeDelivery,
  fallbackIntro,
  introInstruction,
  resolveDeliveryPersona,
} from "../src/lib/timecapsule";
import { issueSnoozeToken } from "../src/lib/snoozeToken";
import { parseRule, nextOccurrence, pastEndDate } from "../src/lib/recurrence";
import { runBackup } from "../src/lib/backup";
import { googleConfigured } from "../src/lib/google";
import { syncUser } from "../src/lib/googlesync";
import { generateWeeklyLetter } from "../src/lib/letter";
import { sendToUser, pushConfigured } from "../src/lib/push";
import { getWeather, weatherSourceConfigured } from "../src/lib/weather";
import { getLlmConfig, getEmbedConfig, type EmbedConfig } from "../src/lib/config";
import { embed } from "../src/lib/embeddings";
import { completeChat } from "../src/lib/llm";
import { extractMemories } from "../src/lib/memory";
import { buildContext, buildSystemPrompt, type Role } from "../src/lib/persona";
import {
  isSlotDue,
  proactiveInstruction,
  diaryReminderInstruction,
  todayInTz,
  nowHHMMInTz,
  startOfWeekInTz,
  toHHMM,
  type Trigger,
} from "../src/lib/proactive";

function log(msg: string) {
  console.log(`[worker] ${new Date().toISOString()} ${msg}`);
}

function timeLabel(d: Date): string {
  return new Date(d).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ALARM_REPEAT_MIN = 5; // 반복 알림(스누즈) 간격(분)

async function notifyAlarm(e: {
  id: number;
  userId: number;
  title: string;
  startsAt: Date | string;
}) {
  const sent = await sendToUser(e.userId, {
    title: "🔔 일정 알림",
    body: `${e.title} · ${timeLabel(e.startsAt as Date)}`,
    url: "/events",
    tag: `event-${e.id}`,
    requireInteraction: true, // 알람은 놓치지 않게 화면에 유지
    eventId: e.id, // 탭 시 반복 알림 ack
    actions: [
      { action: "ack", title: "확인" },
      { action: "snooze", title: "10분 뒤 다시" },
    ],
    snoozeToken: issueSnoozeToken(e.id), // 세션 없는 sw 에서 스누즈 인증(1회용·30분)
  });
  log(`  event#${e.id} "${e.title}" → ${sent}건 발송`);
}

/**
 * 상시알람 재무장 — 현재 발생이 끝난(keep 창 경과) 상시알람을 다음 발생으로 옮긴다.
 *   다음 발생이 종료일(end_date)을 넘으면 자동 비활성(보관, 삭제 아님). 다음 틱부터 그 시각에 다시 울림.
 */
async function rearmStandingAlarms() {
  try {
    const rows = await eventsRepo.listStandingToRearm();
    if (rows.length === 0) return;
    const now = new Date();
    let rearmed = 0;
    let archived = 0;
    for (const r of rows) {
      const rule = parseRule(r.recurrence);
      if (!rule) continue;
      const s = await settingsRepo.getByUser(r.userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const next = nextOccurrence(rule, r.startsAt as Date, tz, now);
      if (!next || pastEndDate(next, r.endDate as string | null, tz)) {
        await eventsRepo.deactivateById(r.id); // 코스 끝 → 알아서 내려감
        archived++;
      } else {
        await eventsRepo.setStartsAtRearm(r.id, next);
        rearmed++;
      }
    }
    if (rearmed || archived) log(`rearmStanding: 재무장 ${rearmed} + 보관 ${archived}건`);
  } catch (err) {
    log(`rearmStanding 오류: ${(err as Error)?.message}`);
  }
}

/** 매 1분 — 상시 재무장 + 신규 알람 청구 + 반복(스누즈) 청구 후 해당 사용자에게 푸시. */
async function alarmJob() {
  try {
    await rearmStandingAlarms(); // 지난 발생 → 다음 발생/보관(청구 전에)
    const due = await eventsRepo.claimDueAlarms();
    const repeats = await eventsRepo.claimDueRepeats(ALARM_REPEAT_MIN);
    const snoozes = await eventsRepo.claimDueSnoozes();
    const all = [...due, ...repeats, ...snoozes];
    if (all.length === 0) return;
    log(`alarmJob: 신규 ${due.length} + 반복 ${repeats.length} + 스누즈 ${snoozes.length}건 발송`);
    for (const e of all) await notifyAlarm(e);
  } catch (err) {
    log(`alarmJob 오류: ${(err as Error)?.message}`);
  }
}

/** 매시 — 사용자 격자별로 날씨 조회 후 캐시 갱신(격자 단위 dedup). */
async function weatherJob() {
  if (!weatherSourceConfigured()) return; // 키 없으면 스킵
  try {
    const grids = await weatherRepo.distinctGrids();
    if (grids.length === 0) return;
    log(`weatherJob: 격자 ${grids.length}곳 갱신`);
    for (const g of grids) {
      if (g.nx == null || g.ny == null) continue;
      const lat = g.lat != null ? Number(g.lat) : null;
      const lon = g.lon != null ? Number(g.lon) : null;
      const w = await getWeather(g.nx, g.ny, lat, lon);
      if (w) {
        await weatherRepo.upsert(g.nx, g.ny, w, w.hasRain, w.hasSnow, new Date(w.fetchedAt));
        log(`  (${g.nx},${g.ny}) ${w.source} ${w.tempC ?? "?"}° ${w.summary}`);
      } else {
        log(`  (${g.nx},${g.ny}) 조회 실패`);
      }
    }
  } catch (err) {
    log(`weatherJob 오류: ${(err as Error)?.message}`);
  }
}

// 한 트리거(아침/저녁)에 대해 담당 캐릭터로 선제 톡 생성 → 스레드 저장 + 푸시.
async function sendProactive(
  userId: number,
  personaId: number,
  trigger: Trigger,
  conn: Awaited<ReturnType<typeof getLlmConfig>>,
  weatherLine?: string,
) {
  const persona = await personasRepo.getOne(userId, personaId);
  if (!persona || !persona.isActive) return;
  const ctx = await buildContext(userId);
  // 아침 브리핑에만 펫 목록·주머니 메모 수를 컨텍스트로 — 가끔 한 줄 언급 허용(의무 아님, 독촉 금지).
  let petsLine: string | undefined;
  let memoCount: number | undefined;
  if (trigger === "morning") {
    petsLine = await getPetBriefingLine(userId); // 펫 모듈 경계 경유(워커는 펫 repo를 직접 모름)
    memoCount = await memosRepo.countOpen(userId);
  }
  const text = (
    await completeChat(conn, [
      {
        role: "system",
        content: buildSystemPrompt(
          { name: persona.name, roles: persona.roles as Role[], traits: persona.traits },
          ctx,
        ),
      },
      { role: "user", content: proactiveInstruction(trigger, weatherLine, petsLine, memoCount) },
    ])
  ).trim();
  if (!text) return;

  await messagesRepo.add(userId, personaId, "proactive", text);
  // 아침 브리핑은 요약 2~3줄을 그대로 실어 잠금화면에서 자동 펼침(BigText) 유도. 그 외는 짧게.
  const cap = trigger === "morning" ? 300 : 120;
  const body = text.length > cap ? text.slice(0, cap - 1) + "…" : text;
  const sent = await sendToUser(userId, {
    title: persona.name?.trim() || "하루등불",
    body,
    url: `/chat/${personaId}`,
    tag: `proactive-${trigger}`,
  });
  await usageRepo.log(userId, "proactive");
  log(`  proactive ${trigger} → user#${userId} persona#${personaId} (push ${sent})`);
}

/**
 * 도착일이 된 타임캡슐 배달(전 사용자, proactive 토글과 무관 — 사용자가 명시적으로 봉인한 약속).
 * 인트로만 페르소나가 생성하고 본문은 원문 그대로 결합(LLM에 본문 미전달). 원자적 청구로 중복 방지.
 */
async function deliverDueCapsules() {
  let due;
  try {
    due = await capsulesRepo.listAllDue();
  } catch (err) {
    log(`capsule listDue 오류: ${(err as Error)?.message}`);
    return;
  }
  for (const cap of due) {
    try {
      // 배달 캐릭터: 지정(활성) → 비서 폴백 → 아무 활성 캐릭터. 활성 캐릭터 없으면 보류.
      const actives = await personasRepo.listActiveByUser(cap.userId);
      const persona = resolveDeliveryPersona(actives, cap.personaId);
      if (!persona) continue;

      // 원자적 청구 — 중복 배달 방지(다른 틱이 이미 가져갔으면 skip).
      const claimed = await capsulesRepo.claimDelivery(cap.id);
      if (!claimed) continue;

      const createdLabel = new Date(cap.createdAt ?? new Date()).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // 인트로만 생성(LLM). 본문은 절대 LLM에 주지 않는다 — 실패/미설정이면 폴백 인트로.
      let intro = fallbackIntro(createdLabel);
      const conn = await getLlmConfig(cap.userId);
      if (conn.configured) {
        try {
          const ctx = await buildContext(cap.userId);
          const out = (
            await completeChat(conn, [
              {
                role: "system",
                content: buildSystemPrompt(
                  { name: persona.name, roles: persona.roles as Role[], traits: persona.traits },
                  ctx,
                ),
              },
              { role: "user", content: introInstruction(createdLabel) },
            ])
          ).trim();
          if (out) intro = out;
        } catch {
          /* 폴백 인트로 유지 */
        }
      }

      const full = composeDelivery(intro, cap.content); // 원문 그대로 결합(코드에서)
      await messagesRepo.add(cap.userId, persona.id, "proactive", full);
      // 잠금화면에 편지 내용 미노출(사적) — 도착 사실만, 탭하면 대화방에서 열림.
      const sent = await sendToUser(cap.userId, {
        title: "📮 편지가 도착했어요",
        body: `${persona.name?.trim() || "캐릭터"}이(가) 맡아둔 편지를 전해요. 탭해서 열어보세요.`,
        url: `/chat/${persona.id}`,
        tag: `capsule-${cap.id}`,
      });
      await usageRepo.log(cap.userId, "proactive");
      log(`  timecapsule → user#${cap.userId} capsule#${cap.id} persona#${persona.id} (push ${sent})`);
    } catch (err) {
      log(`capsule deliver #${cap.id} 오류: ${(err as Error)?.message}`);
    }
  }
}

// 펫 편지 답장 배달 — 도착 시각 도래한 pending 을 청구→주모델 생성(재시도 1)→폴백→푸시.
async function buildReplyRels(userId: number, petId: number): Promise<ReplyRelation[]> {
  try {
    const rels = await petRelationsRepo.listForPet(userId, petId);
    if (rels.length === 0) return [];
    const all = await petsRepo.listByUser(userId);
    const nameOf = new Map(all.map((p) => [p.id, p.name]));
    return rels
      .map((r) => {
        const otherId = r.petAId === petId ? r.petBId : r.petAId;
        const name = nameOf.get(otherId);
        return name ? { name, label: r.relationLabel } : null;
      })
      .filter((x): x is ReplyRelation => !!x);
  } catch {
    return [];
  }
}

async function deliverDueLetterReplies() {
  let due;
  try {
    due = await letterRepliesRepo.listAllDue();
  } catch (err) {
    log(`letter reply listDue 오류: ${(err as Error)?.message}`);
    return;
  }
  for (const r of due) {
    try {
      const pet = await petsRepo.getOne(r.userId, r.petId);
      const petName = pet?.name ?? "펫";
      // 원자적 청구 — content 를 폴백으로 채워 빈 답장 방지(이후 생성분으로 덮어씀).
      const claimed = await letterRepliesRepo.claimArrival(r.id, fallbackReply(petName));
      if (!claimed) continue;

      // 주모델(편지 전용→메인→aux)로 생성. 실패/미설정이면 폴백 유지.
      if (pet) {
        const cfg = await getLetterConfig(r.userId);
        if (cfg.configured) {
          // 그 펫이 사용자와 쌓은 'pet' 추억만 회수(사적·메타·타 영역 기억은 절대 안 섞임).
          const petMems = await recallPetMemories(r.userId, pet.id, r.letterContent).catch(() => []);
          const msgs = buildReplyMessages(
            { name: pet.name, personality: pet.personality },
            r.letterContent,
            await buildReplyRels(r.userId, pet.id),
            petMems,
          );
          let content = "";
          for (let attempt = 0; attempt < 2 && !content; attempt++) {
            try {
              // 캐릭터 voice 다양성 — 편지 답장 전용 샘플링(temperature 0.95 / top_p 0.92 / top_k 60).
              content = (await completeChat(cfg, msgs, undefined, REPLY_SAMPLING)).trim();
            } catch {
              /* 재시도 */
            }
          }
          if (content) {
            await letterRepliesRepo.setContent(r.id, content);
            // 이번 편지 교환에서 펫 추억 한 줄 추출·저장(scope='pet'). 민감/사적 정보는 추출 프롬프트가 배제. best-effort.
            try {
              const memRaw = (await completeChat(cfg, buildMemoryExtractMessages({ name: pet.name }, r.letterContent, content))).trim();
              const mem = sanitizePetMemory(memRaw);
              if (mem) {
                await savePetMemory(r.userId, pet.id, mem);
                log(`  letter-reply mem+ user#${r.userId} pet#${pet.id}: ${mem.slice(0, 40)}`);
              }
            } catch (e) {
              log(`  letter-reply mem 추출 실패 #${r.id}: ${(e as Error)?.message}`);
            }
          }
        }
      }

      const sent = await sendToUser(r.userId, {
        title: "💌 편지가 도착했어요",
        body: `${petName}의 답장이 왔어요. 우체통을 열어보세요.`,
        url: "/mailbox",
        tag: `letter-reply-${r.id}`,
      });
      log(`  letter-reply → user#${r.userId} reply#${r.id} pet#${r.petId} (push ${sent})`);
    } catch (err) {
      log(`letter reply deliver #${r.id} 오류: ${(err as Error)?.message}`);
    }
  }
}

/** 매 5분 — proactive 켠 사용자별로 아침(비서)/저녁(상담가) 슬롯 도달 시 선제 톡. */
async function proactiveJob() {
  try {
    await deliverDueCapsules(); // 타임캡슐 배달(토글 무관)
    await deliverDueLetterReplies(); // 펫 편지 답장 배달(토글 무관)
    const rows = await settingsRepo.listProactiveEnabled();
    for (const s of rows) {
      const tz = s.timezone ?? "Asia/Seoul";
      const today = todayInTz(tz);
      const now = nowHHMMInTz(tz);

      const conn = await getLlmConfig(s.userId);
      if (!conn.configured) continue; // 생성 불가 — 다음 기회에

      // 아침 (비서 담당)
      const mTime = toHHMM(s.morningTime);
      if (s.morningPersonaId && mTime && isSlotDue(now, mTime, s.lastMorningSent ?? null, today)) {
        await settingsRepo.updateByUser(s.userId, { lastMorningSent: today }); // 먼저 청구
        // 브리핑이 구글 쪽 최신 일정을 반영하도록, 생성 직전 동기화(best-effort).
        // 실패는 로깅만 — 사용자에게 노출 금지, 다음 주기에 재시도된다.
        if (googleConfigured()) {
          try {
            await syncUser(s.userId);
          } catch (err) {
            console.error(`[worker] proactive presync user#${s.userId} 실패:`, (err as Error)?.message);
          }
        }
        let weatherLine: string | undefined;
        if (s.kmaNx != null && s.kmaNy != null) {
          const w = await weatherRepo.getByGrid(s.kmaNx, s.kmaNy);
          const p = w?.payload as { summary?: string; tempC?: number | null } | undefined;
          if (p?.summary) {
            weatherLine = `${p.summary}${p.tempC != null ? ` ${p.tempC}°` : ""}` +
              (w?.hasRain || w?.hasSnow ? " (우산 챙기기)" : "");
          }
        }
        await sendProactive(s.userId, s.morningPersonaId, "morning", conn, weatherLine);
      }

      // 저녁 (상담가 담당). 일요일이면 주간 회고 편지로 대체.
      const eTime = toHHMM(s.eveningTime);
      if (s.eveningPersonaId && eTime && isSlotDue(now, eTime, s.lastEveningSent ?? null, today)) {
        await settingsRepo.updateByUser(s.userId, { lastEveningSent: today }); // 먼저 청구
        const isSunday = new Date(today + "T00:00:00Z").getUTCDay() === 0;
        if (isSunday) {
          const r = await generateWeeklyLetter(s.userId);
          if ("id" in r) {
            const sent = await sendToUser(s.userId, {
              title: "📮 주간 회고 편지",
              body: "이번 주를 담은 편지가 도착했어요.",
              url: `/letters/${r.id}`,
              tag: `letter-${r.weekStart}`,
            });
            await usageRepo.log(s.userId, "proactive");
            log(`  weekly letter → user#${s.userId} letter#${r.id} (push ${sent})`);
          } else {
            log(`  weekly letter skip user#${s.userId}: ${r.skipped}`);
            await sendProactive(s.userId, s.eveningPersonaId, "evening", conn); // 데이터 없으면 일반 저녁톡
          }
        } else {
          await sendProactive(s.userId, s.eveningPersonaId, "evening", conn);
        }
      }
    }
  } catch (err) {
    log(`proactiveJob 오류: ${(err as Error)?.message}`);
  }
}

// 일기/체크인 기록(사진 포함)이 하나라도 있으면 "작성한 날"로 본다.
function hasDiaryActivity(e: {
  mood: string | null;
  bodyCondition: string | null;
  body: string | null;
  photoPath: string | null;
} | undefined): boolean {
  return (
    !!e &&
    (!!e.mood || !!e.bodyCondition || !!(e.body && e.body.trim()) || !!e.photoPath)
  );
}

// 일기 리마인드 — 담당 캐릭터의 선제 톡으로 생성(대화방 + 푸시). askReduce면 "줄여줄까?" 포함.
async function sendDiaryReminder(
  userId: number,
  personaId: number,
  conn: Awaited<ReturnType<typeof getLlmConfig>>,
  askReduce: boolean,
) {
  const persona = await personasRepo.getOne(userId, personaId);
  if (!persona || !persona.isActive) return;
  const ctx = await buildContext(userId);
  const text = (
    await completeChat(conn, [
      {
        role: "system",
        content: buildSystemPrompt(
          { name: persona.name, roles: persona.roles as Role[], traits: persona.traits },
          ctx,
        ),
      },
      { role: "user", content: diaryReminderInstruction(askReduce) },
    ])
  ).trim();
  if (!text) return;

  await messagesRepo.add(userId, personaId, "proactive", text);
  const sent = await sendToUser(userId, {
    title: persona.name?.trim() || "하루등불",
    body: text.length > 120 ? text.slice(0, 117) + "…" : text,
    url: "/diary",
    tag: "diary-reminder",
  });
  await usageRepo.log(userId, "proactive");
  log(`  diaryReminder → user#${userId} persona#${personaId} ask=${askReduce} (push ${sent})`);
}

/** 매 5분 — 일기 리마인드 켠 사용자별. 시간 도래 + 당일 미작성이면 1회 발송. */
async function diaryReminderJob() {
  try {
    const rows = await settingsRepo.listDiaryReminderEnabled();
    for (const s of rows) {
      const tz = s.timezone ?? "Asia/Seoul";
      const today = todayInTz(tz);
      const now = nowHHMMInTz(tz);
      const rTime = toHHMM(s.diaryReminderTime);
      if (!s.diaryReminderPersonaId || !rTime) continue;
      if (!isSlotDue(now, rTime, s.diaryReminderLastSent ?? null, today)) continue;

      // 당일 일기/체크인 있으면 스킵(청구도 안 함).
      const todayEntry = await diaryRepo.getByDate(s.userId, today);
      if (hasDiaryActivity(todayEntry)) continue;

      const conn = await getLlmConfig(s.userId);
      if (!conn.configured) continue;

      // 자동 후퇴: 직전 리마인드 날 미작성이면 streak+1, 작성됐으면 0. 7 도달 시 질문 1회.
      let streak = s.diaryReminderNoWriteStreak ?? 0;
      const prev = s.diaryReminderLastSent;
      if (prev && prev !== today) {
        const prevEntry = await diaryRepo.getByDate(s.userId, prev);
        streak = hasDiaryActivity(prevEntry) ? 0 : streak + 1;
      }
      const askReduce = streak >= 7;

      // 먼저 청구(중복 방지) + 스트릭 저장(물어봤으면 리셋).
      await settingsRepo.updateByUser(s.userId, {
        diaryReminderLastSent: today,
        diaryReminderNoWriteStreak: askReduce ? 0 : streak,
      });
      await sendDiaryReminder(s.userId, s.diaryReminderPersonaId, conn, askReduce);
    }
  } catch (err) {
    log(`diaryReminderJob 오류: ${(err as Error)?.message}`);
  }
}

const MEM_CHAT_THRESHOLD = 20; // 미처리 대화 20턴 이상이면 추출

// 추출 후보를 중복 제거하며 저장 → 저장 건수 반환. 임베딩 가능하면 같이 생성(best-effort).
async function saveMemories(
  userId: number,
  cands: { content: string; importance: number }[],
  source: "chat" | "diary",
  embedCfg: EmbedConfig,
): Promise<number> {
  let added = 0;
  for (const c of cands) {
    if (await memoriesRepo.existsContent(userId, c.content)) continue;
    const row = await memoriesRepo.add(userId, c.content, source, c.importance);
    if (embedCfg.configured) {
      const vec = await embed(embedCfg, c.content);
      if (vec) await memoriesRepo.setEmbedding(userId, row.id, vec);
    }
    added++;
  }
  return added;
}

// 임베딩 안 된 기억 점진 백필(매 실행 최대 N건). 미설정이면 no-op.
async function backfillEmbeddings(userId: number, embedCfg: EmbedConfig): Promise<number> {
  if (!embedCfg.configured) return 0;
  let done = 0;
  for (const m of await memoriesRepo.listMissingEmbedding(userId, 20)) {
    const vec = await embed(embedCfg, m.content);
    if (vec) {
      await memoriesRepo.setEmbedding(userId, m.id, vec);
      done++;
    }
  }
  return done;
}

/** 매 30분 — 사용자별 미처리 대화(20턴↑)·새 일기에서 장기기억 추출 → memories. */
async function memoryJob() {
  const rows = await settingsRepo.listAll();
  for (const s of rows) {
    try {
      const conn = await getLlmConfig(s.userId);
      if (!conn.configured) continue;
      const embedCfg = await getEmbedConfig(s.userId);

      // 대화: 워터마크 이후 20턴 이상 쌓였으면 추출
      const msgWm = s.memoryLastMsgId ?? 0;
      const msgs = await messagesRepo.listSinceId(s.userId, msgWm);
      if (msgs.length >= MEM_CHAT_THRESHOLD) {
        const transcript = msgs
          .map((m) => `${m.role === "user" ? "사용자" : "캐릭터"}: ${m.content}`)
          .join("\n");
        const cands = await extractMemories(conn, transcript); // 실패 시 throw → 워터마크 보류
        const added = await saveMemories(s.userId, cands, "chat", embedCfg);
        await settingsRepo.updateByUser(s.userId, { memoryLastMsgId: msgs[msgs.length - 1].id });
        await usageRepo.log(s.userId, "memory");
        log(`memoryJob: user#${s.userId} chat ${msgs.length}턴 → 기억 ${added}건`);
      }

      // 일기: 워터마크 이후 새 일기가 있으면 추출(본문 있는 것만)
      const dWm = s.memoryLastDiaryId ?? 0;
      const diaries = await diaryRepo.listSinceId(s.userId, dWm);
      if (diaries.length > 0) {
        const withBody = diaries.filter((d) => d.body && d.body.trim());
        if (withBody.length > 0) {
          const text = withBody.map((d) => `[${d.entryDate}] ${d.body}`).join("\n\n");
          const cands = await extractMemories(conn, text);
          const added = await saveMemories(s.userId, cands, "diary", embedCfg);
          await usageRepo.log(s.userId, "memory");
          log(`memoryJob: user#${s.userId} 일기 ${withBody.length}편 → 기억 ${added}건`);
        }
        await settingsRepo.updateByUser(s.userId, {
          memoryLastDiaryId: diaries[diaries.length - 1].id,
        });
      }

      // 기존/누락 기억 임베딩 점진 백필
      const filled = await backfillEmbeddings(s.userId, embedCfg);
      if (filled) log(`memoryJob: user#${s.userId} 임베딩 백필 ${filled}건`);
    } catch (err) {
      log(`memoryJob user#${s.userId} 오류: ${(err as Error)?.message}`);
    }
  }
}

/** 매 15분 — Google 연결된 사용자마다 양방향 동기화. */
async function googleSyncJob() {
  if (!googleConfigured()) return;
  try {
    const accounts = await googleRepo.listAll();
    for (const a of accounts) {
      try {
        const r = await syncUser(a.userId);
        if (r && (r.pulled || r.pushed)) log(`googleSync: user#${a.userId} 받음 ${r.pulled}·보냄 ${r.pushed}`);
      } catch (err) {
        log(`googleSync user#${a.userId} 오류: ${(err as Error)?.message}`);
      }
    }
  } catch (err) {
    log(`googleSyncJob 오류: ${(err as Error)?.message}`);
  }
}

/** 매일 04:00 — pg_dump → /data/backups (7일 로테이션). */
async function backupJob() {
  try {
    const { file, bytes, pruned } = await runBackup();
    log(`backupJob: ${file} (${Math.round(bytes / 1024)}KB)${pruned ? `, 오래된 ${pruned}개 삭제` : ""}`);
  } catch (err) {
    log(`backupJob 오류: ${(err as Error)?.message}`);
  }
}

/** 매일 — 14일 경과한 pending 핸드오프를 조용히 expired 로(알림·표시 없음). */
async function handoffExpiryJob() {
  try {
    const n = await handoffsRepo.expireOld();
    if (n > 0) log(`handoffExpiryJob: ${n}건 만료(조용히)`);
    const a = await achievementSuggRepo.expireOld();
    if (a > 0) log(`achievementExpiry: ${a}건 만료(조용히)`);
  } catch (err) {
    log(`handoffExpiryJob 오류: ${(err as Error)?.message}`);
  }
}

// 주간 결산 정리 — 지난 주에 '해치운'(done) 주머니메모를 주 경계(일→월 자정, 사용자 tz)에 일괄 삭제.
//   타임스탬프상 며칠 지났든, 이번 주 월요일 0시를 넘기면 그 이전 완료분은 비운다(쌓이지 않게).
//   이번 주에 해치운 것·미완료 메모·주간 회고 편지는 보존. cutoff가 주 시작이라 멱등(매시 호출 무해).
async function memoPurgeJob() {
  try {
    let total = 0;
    for (const s of await settingsRepo.listAll()) {
      const cutoff = startOfWeekInTz(s.timezone ?? "Asia/Seoul");
      total += await memosRepo.purgeDoneBefore(s.userId, cutoff);
    }
    if (total > 0) log(`memoPurge: 완료 주머니메모 ${total}건 정리(지난 주분)`);
  } catch (err) {
    log(`memoPurge 오류: ${(err as Error)?.message}`);
  }
}

log(
  "started — alarm(1분)+weather(매시)+proactive(5분)+diaryReminder(5분)+memory(30분)+handoffExpiry(매일)+backup(04:00)+googleSync(15분) 등록",
);
if (!pushConfigured()) {
  log("⚠️ VAPID 미설정 — 알람은 청구되나 푸시는 0건. .env 의 VAPID_* 확인.");
}
if (!weatherSourceConfigured()) {
  log("⚠️ 날씨원 미설정 — KMA_API_KEY/OWM_API_KEY 없으면 weatherJob 스킵.");
}

cron.schedule("* * * * *", alarmJob);
cron.schedule("0 * * * *", weatherJob);
cron.schedule("*/5 * * * *", proactiveJob);
cron.schedule("*/5 * * * *", diaryReminderJob); // 일기 리마인드(선제 톡 재사용)
cron.schedule("*/30 * * * *", memoryJob);
cron.schedule("0 4 * * *", handoffExpiryJob); // 매일 04시
cron.schedule("0 * * * *", memoPurgeJob); // 매시 — 사용자 tz로 주 경계(일→월 자정) 도달 시 지난 주 완료 메모 정리(주간 편지는 보존)
cron.schedule("0 4 * * *", backupJob); // 매일 04:00 pg_dump
cron.schedule("*/15 * * * *", googleSyncJob); // 매 15분 Google 동기화
// 부팅 직후 1회 — 캐시 초기화 + 밀린 만료 처리(백업은 매일 스케줄만, 재시작마다 X)
void weatherJob();
void handoffExpiryJob();
