// 하루등불 worker 엔트리포인트.
// Phase 1: 골격만 — 실제 잡은 Phase 2에서 node-cron으로 등록한다.
//   proactiveJob(5분) / alarmJob(1분) / weatherJob(1시간)
//   memoryJob(30분) / backupJob(매일 04:00)
// app과 src/db, src/lib 코드를 공유하지만 프로세스를 분리해 중복 실행을 막는다.

function log(msg: string) {
  console.log(`[worker] ${new Date().toISOString()} ${msg}`);
}

log("started (Phase 1 골격 — 활성 잡 없음)");

setInterval(() => {
  log("heartbeat");
}, 60_000);
