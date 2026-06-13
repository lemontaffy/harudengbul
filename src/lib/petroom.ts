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
