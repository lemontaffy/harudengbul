import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { completeChat } from "@/lib/llm";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { phraseForDate } from "@/lib/phrases";
import { todayInTz } from "@/lib/proactive";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 홈 "한마디" — 활성 캐릭터 목소리로 하루 1회 생성·캐시. 미설정/실패 시 정적 폴백(캐시 안 함).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const s = await settingsRepo.getByUser(user.id);
  const tz = s?.timezone ?? "Asia/Seoul";
  const today = todayInTz(tz);

  // 오늘자 캐시 있으면 그대로
  if (s?.dailyPhraseDate === today && s?.dailyPhrase) {
    return Response.json({ phrase: s.dailyPhrase, generated: true });
  }

  const conn = await getLlmConfig(user.id);
  const persona = s?.activePersonaId
    ? await personasRepo.getOne(user.id, s.activePersonaId)
    : (await personasRepo.listActiveByUser(user.id))[0];

  if (conn.configured && persona) {
    try {
      const ctx = await buildContext(user.id);
      let text = (
        await completeChat(conn, [
          {
            role: "system",
            content: buildSystemPrompt(
              { name: persona.name, roles: persona.roles as Role[], traits: persona.traits },
              ctx,
            ),
          },
          {
            role: "user",
            content:
              "오늘 하루를 여는 따뜻한 '한마디'를 딱 한 문장으로 건네줘. " +
              "따옴표·이모지·해설 없이 문장만, 25자 내외로 짧게.",
          },
        ])
      ).trim();
      // 정리: 따옴표 제거, 첫 줄만, 과도하게 길면 컷
      text = text.replace(/^["'“”]+|["'“”]+$/g, "").split("\n")[0].trim();
      if (text) {
        if (text.length > 60) text = text.slice(0, 60);
        await settingsRepo.updateByUser(user.id, {
          dailyPhrase: text,
          dailyPhraseDate: today,
        });
        return Response.json({ phrase: text, generated: true });
      }
    } catch (err) {
      console.error("[phrase] 생성 실패:", (err as Error)?.message);
    }
  }

  // 폴백: 정적 풀(캐시 안 함 — 연결되면 다음에 생성형으로 업그레이드)
  return Response.json({ phrase: phraseForDate(today), generated: false });
}
