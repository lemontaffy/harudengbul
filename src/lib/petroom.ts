// 방 연출 순수 헬퍼(테스트용). 클라이언트 RoomView 가 사용.

/** 산책 소요시간 — 거리 비례(등속). 너무 짧지 않게 하한. */
export function walkDurationMs(fromX: number, toX: number, speedPctPerSec = 7): number {
  const dist = Math.abs(toX - fromX);
  return Math.max(700, Math.round((dist / speedPctPerSec) * 1000));
}

/** walk GIF 기본 진행 방향(walkFacing) 대비 실제 이동 방향이 반대면 좌우 반전. */
export function shouldFlip(walkFacing: "left" | "right", movingRight: boolean): boolean {
  const gifGoesRight = walkFacing === "right";
  return gifGoesRight !== movingRight;
}

/** 관계/쿨다운 페어 키(순서 무관). */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** 빈도 → 가중치(커스텀 모션 선택). manual 은 자동 재생 제외(0). */
export function freqWeight(freq: string): number {
  if (freq === "often") return 3;
  if (freq === "sometimes") return 1;
  return 0; // manual
}

/**
 * 실효 활동성 = activeness × (liveliness/50). 곱셈이라 펫 간 상대비는 보존(기질 차이 유지).
 * liveliness 0 → 0(완전 정지), 50 → activeness 그대로, 100 → 2배.
 */
export function effectiveActiveness(activeness: number, liveliness: number): number {
  return Math.max(0, activeness) * (Math.max(0, liveliness) / 50);
}

/** 배회 거리 — 실효 활동성에 따라 늘되 짧게(전체 횡단 방지, 최대 30%). */
export function wanderRange(ea: number): number {
  return Math.min(30, 10 + ea * 0.12);
}

/** 틱당 산책 시작 확률(0~0.85) — 정지 우세. */
export function walkStartProb(ea: number): number {
  return Math.max(0, Math.min(0.85, ea / 150));
}

/** 틱당 핑퐁 확률 — 페어 평균 실효 활동성 기준. boost(산책 조우)면 상향. */
export function pingpongProb(eaAvg: number, boost = false): number {
  const base = Math.max(0, Math.min(0.7, eaAvg / 130));
  return boost ? Math.min(0.9, base + 0.3) : base;
}
