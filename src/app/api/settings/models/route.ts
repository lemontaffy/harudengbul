import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import { fetchModels } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 저장된 본인 연결로 모델 목록 조회. 키는 응답에 포함하지 않는다.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const s = await settingsRepo.getByUser(user.id);
  const baseUrl = s?.llmBaseUrl?.trim();
  const apiKey = s?.llmApiKey?.trim();
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
