// Next.js 기동 훅 — 서버 시작 시 1회 실행. 데이터 디렉터리 쓰기 권한 점검.
export async function register() {
  // nodejs 런타임에서만(엣지 런타임엔 fs 없음).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkDataDirsWritable } = await import("@/lib/datadirs");
    await checkDataDirsWritable();
  }
}
