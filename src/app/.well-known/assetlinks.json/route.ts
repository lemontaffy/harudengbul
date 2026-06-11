// Digital Asset Links — TWA(안드로이드 앱)가 이 도메인을 소유했음을 증명(주소창 없는 전체화면).
// 값은 env 로만: 키스토어를 만든 뒤 SHA-256 지문을 ASSETLINKS_FINGERPRINTS 에 넣고 재배포하면 됨.
//   TWA_PACKAGE_NAME       예: org.daltavern.haru
//   ASSETLINKS_FINGERPRINTS  쉼표로 여러 개(디버그키/업로드키/Play 서명키 등)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const pkg = process.env.TWA_PACKAGE_NAME?.trim() || "org.daltavern.haru";
  const fingerprints = (process.env.ASSETLINKS_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 지문 미설정이면 빈 배열(유효 JSON) — 설정 전까지 TWA 검증은 통과 안 됨.
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: pkg,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return Response.json(body, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
