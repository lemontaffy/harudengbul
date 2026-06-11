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
import * as usageRepo from "../src/db/repo/usage";
import { sendToUser, pushConfigured } from "../src/lib/push";
import { getWeather, weatherSourceConfigured } from "../src/lib/weather";
import { getLlmConfig } from "../src/lib/config";
import { completeChat } from "../src/lib/llm";
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

/** 매 1분 — 알람 도달 일정을 원자적으로 청구하고 해당 사용자에게 푸시. */
async function alarmJob() {
  try {
    const due = await eventsRepo.claimDueAlarms();
    if (due.length === 0) return;
    log(`alarmJob: ${due.length}건 알람 발송 시도`);
    for (const e of due) {
      const sent = await sendToUser(e.userId, {
        title: "🔔 일정 알림",
        body: `${e.title} · ${timeLabel(e.startsAt as Date)}`,
        url: "/events",
        tag: `event-${e.id}`,
      });
      log(`  event#${e.id} "${e.title}" → ${sent}건 발송`);
    }
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

log("started — alarmJob(매 1분) + weatherJob(매시) + proactiveJob(매 5분) 등록");
if (!pushConfigured()) {
  log("⚠️ VAPID 미설정 — 알람은 청구되나 푸시는 0건. .env 의 VAPID_* 확인.");
}
if (!weatherSourceConfigured()) {
  log("⚠️ 날씨원 미설정 — KMA_API_KEY/OWM_API_KEY 없으면 weatherJob 스킵.");
}

cron.schedule("* * * * *", alarmJob);
cron.schedule("0 * * * *", weatherJob);
cron.schedule("*/5 * * * *", proactiveJob);
// 부팅 직후 1회(캐시 초기화) — 비동기 fire-and-forget
void weatherJob();
