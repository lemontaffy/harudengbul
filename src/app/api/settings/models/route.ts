import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { fetchModels } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 저장된 본인 연결로 모델 목록 조회. 키는 응답에 포함하지 않는다.
// 키는 DB에 암호화 저장이므로 반드시 getLlmConfig(복호화)로 읽는다.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { baseUrl, apiKey } = await getLlmConfig(user.id);
  if (!baseUrl || !apiKey) {
    return Response.json(
      { error: "AI 연결(Base URL·키)을 먼저 저장하세요.", models: [] },
      { status: 400 },
    );
  }

  try {
    const { source, models, cached } = await fetchModels(baseUrl, apiKey);
    return Response.json({ source, models, cached });
  } catch {
    return Response.json(
      {
        error: "모델 목록을 가져오지 못했습니다. 모델명을 직접 입력하세요.",
        models: [],
      },
      { status: 502 },
    );
  }
}
