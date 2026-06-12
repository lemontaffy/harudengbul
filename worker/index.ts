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
import * as googleRepo from "../src/db/repo/google";
import * as usageRepo from "../src/db/repo/usage";
import { runBackup } from "../src/lib/backup";
import { googleConfigured } from "../src/lib/google";
import { syncUser } from "../src/lib/googlesync";
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
  todayInTz,
  nowHHMMInTz,
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
  });
  log(`  event#${e.id} "${e.title}" → ${sent}건 발송`);
}

/** 매 1분 — 신규 알람 청구 + 반복(스누즈) 청구 후 해당 사용자에게 푸시. */
async function alarmJob() {
  try {
    const due = await eventsRepo.claimDueAlarms();
    const repeats = await eventsRepo.claimDueRepeats(ALARM_REPEAT_MIN);
    const all = [...due, ...repeats];
    if (all.length === 0) return;
    log(`alarmJob: 신규 ${due.length} + 반복 ${repeats.length}건 발송`);
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
  const text = (
    await completeChat(conn, [
      {
        role: "system",
        content: buildSystemPrompt(
          { name: persona.name, role: persona.role as Role, traits: persona.traits },
          ctx,
        ),
      },
      { role: "user", content: proactiveInstruction(trigger, weatherLine) },
    ])
  ).trim();
  if (!text) return;

  await messagesRepo.add(userId, personaId, "proactive", text);
  const sent = await sendToUser(userId, {
    title: persona.name?.trim() || "하루등불",
    body: text.length > 120 ? text.slice(0, 117) + "…" : text,
    url: "/chat",
    tag: `proactive-${trigger}`,
  });
  await usageRepo.log(userId, "proactive");
  log(`  proactive ${trigger} → user#${userId} persona#${personaId} (push ${sent})`);
}

/** 매 5분 — proactive 켠 사용자별로 아침(비서)/저녁(상담가) 슬롯 도달 시 선제 톡. */
async function proactiveJob() {
  try {
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

      // 저녁 (상담가 담당)
      const eTime = toHHMM(s.eveningTime);
      if (s.eveningPersonaId && eTime && isSlotDue(now, eTime, s.lastEveningSent ?? null, today)) {
        await settingsRepo.updateByUser(s.userId, { lastEveningSent: today });
        await sendProactive(s.userId, s.eveningPersonaId, "evening", conn);
      }
    }
  } catch (err) {
    log(`proactiveJob 오류: ${(err as Error)?.message}`);
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
  } catch (err) {
    log(`handoffExpiryJob 오류: ${(err as Error)?.message}`);
  }
}

log(
  "started — alarm(1분)+weather(매시)+proactive(5분)+memory(30분)+handoffExpiry(매일)+backup(04:00)+googleSync(15분) 등록",
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
cron.schedule("*/30 * * * *", memoryJob);
cron.schedule("0 4 * * *", handoffExpiryJob); // 매일 04시
cron.schedule("0 4 * * *", backupJob); // 매일 04:00 pg_dump
cron.schedule("*/15 * * * *", googleSyncJob); // 매 15분 Google 동기화
// 부팅 직후 1회 — 캐시 초기화 + 밀린 만료 처리(백업은 매일 스케줄만, 재시작마다 X)
void weatherJob();
void handoffExpiryJob();
