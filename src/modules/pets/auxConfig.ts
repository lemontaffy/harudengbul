// ─────────────────────────────────────────────────────────────────────────
// 펫 룸 모듈 — 보조 모델(AUX) 연결 seam
//
// 펫 대사 생성(petLines)은 보조 LLM이 필요하다. 펫 모듈은 본체의 설정 모듈
// (@/lib/config)을 직접 import 하지 않고, 오직 이 seam을 통해 AUX 설정을 받는다.
//
// ※ 분리는 나중. 지금은 "잘릴 선"만 긋는다 — 구현은 잠정적으로 본체 공통 보조 연결
//   (settings.aux_connection_id, vision 캡션과 공유)에 위임한다. 펫 모듈을 떼어낼 때는
//   이 함수의 구현만 "펫 모듈 자체 AUX 연결 설정"으로 교체하면 되고, 호출부(petLines.ts)는
//   손대지 않는다.
//
// ※ 파일명 주의: Windows 예약 장치명(AUX) 때문에 `aux.ts`는 git이 열지 못한다 →
//   `auxConfig.ts`로 둔다.
// ─────────────────────────────────────────────────────────────────────────

import { getAuxTextConfig, type LlmConfig } from "@/lib/config";

export type { LlmConfig };

/** 펫 대사 생성용 보조 모델 설정. (잠정) 본체 공통 AUX 연결에 위임. */
export async function getPetAuxConfig(userId: number): Promise<LlmConfig> {
  return getAuxTextConfig(userId);
}
