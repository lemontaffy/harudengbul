// 하루등불 worker 엔트리포인트 — node-cron 잡.
//   alarmJob(매 1분): 알람 시각 도달한 일정에 웹푸시 → alarm_sent=true (청구 후 발송).
//   proactive/weather/memory/backup 잡은 다음 단계.
// app과 src/db, src/lib 코드를 공유하지만 프로세스를 분리해 중복 실행을 막는다.
import cron from "node-cron";
import * as eventsRepo from "../src/db/repo/events";
import { sendToUser, pushConfigured } from "../src/lib/push";

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

log("started — alarmJob(매 1분) 등록");
if (!pushConfigured()) {
  log("⚠️ VAPID 미설정 — 알람은 청구되나 푸시는 0건. .env 의 VAPID_* 확인.");
}

cron.schedule("* * * * *", alarmJob);
