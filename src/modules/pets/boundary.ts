// ─────────────────────────────────────────────────────────────────────────
// 펫 룸 모듈 — 공개 경계(public boundary)
//
// 본체(일기·가계부·홈·워커)는 펫 모듈의 내부(repo·lib·컴포넌트)를 직접 import 하지 않고,
// 오직 이 파일만 통해 통신한다. 결합은 전부 단방향: 본체 → 펫(이벤트 전달 / 읽기).
// 펫 모듈은 본체 기능을 import 하지 않는다("펫이 본체를 모름").
//
// ※ 분리는 나중. 이 파일은 "떼어낼 때 잘릴 선"이다. 펫 모듈을 별도 패키지로 빼낼 때
//   이 파일의 export 시그니처만 유지하면 본체 호출부는 손대지 않아도 된다.
//
// 잔여 결합(분리 시 함께 끊을 선) — 자세한 목록은 ./README.md 참고:
//   · 펫 성장 상태(growth_date/growth_today/last_activity_at/pet_last_room_id)가 본체
//     settings 테이블에 얹혀 있음 → 추후 펫 전용 테이블로 이주.
//   · 보조 모델(AUX) 연결은 ./auxConfig.ts seam 경유(본체 공통 aux 연결에 잠정 위임).
// ─────────────────────────────────────────────────────────────────────────

import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import * as settingsRepo from "@/db/repo/settings"; // 잔여 결합: 펫 상태가 본체 settings에 저장됨
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import { grantGrowth, isSleeping } from "@/lib/growth";

// ── 1) 성장 이벤트(쓰기) ─────────────────────────────────────────────────
//    본체에서 "가치 있는 행동"이 일어났을 때 펫 모듈에 단방향으로 전달.
//    본체는 펫 내부(pets repo·일일 상한·activity bump)를 전혀 모른다.

/**
 * 성장 이벤트 전달. `points` 만큼 성장 적립을 시도하고 실제 적립분(일일 상한 적용 후)을 반환.
 * 호출부는 보통 `void recordGrowth(...).catch(() => {})` 로 fire-and-forget.
 */
export async function recordGrowth(userId: number, points: number): Promise<number> {
  return grantGrowth(userId, points);
}

// ── 2) 홈 미니 위젯(읽기) ────────────────────────────────────────────────
//    본체 홈이 펫 repo/렌더 헬퍼를 직접 건드리지 않게, 위젯이 필요한 만큼만 노출.

export interface PetMiniItem {
  name: string;
  avatar: string | null; // idle 스프라이트 경로(표시 스테이지, 폴백 적용)
  asleep: boolean;
}
export interface PetMiniWidgetData {
  roomId: number;
  items: PetMiniItem[];
}

/** 마지막 본 방(없으면 펫이 있는 첫 방)의 펫 요약. 어느 방에도 펫이 없으면 null(위젯 미표시). */
export async function getPetMiniWidget(userId: number): Promise<PetMiniWidgetData | null> {
  const allPets = await petsRepo.listByUser(userId);
  // 펫은 전역 — 대기(roomId null) 펫은 위젯에 안 뜸. 방에 배치된 펫만 대상.
  const roomed = allPets.filter((p): p is typeof p & { roomId: number } => p.roomId != null);
  if (roomed.length === 0) return null;

  const s = await settingsRepo.getByUser(userId);
  const lastRoomId = s?.petLastRoomId ?? null;
  const roomId =
    lastRoomId && roomed.some((p) => p.roomId === lastRoomId) ? lastRoomId : roomed[0].roomId;
  const inRoom = roomed.filter((p) => p.roomId === roomId);
  const petSprites = await spritesRepo.listForRoom(userId, roomId);
  const asleep = isSleeping(s?.lastActivityAt);

  return {
    roomId,
    items: inRoom.map((p) => {
      const growth = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
      const display = displayStageFor(
        growth,
        p.displayStage,
        reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold),
      );
      return {
        name: p.name,
        avatar: pickSpritePath(petSprites.filter((sp) => sp.petId === p.id), display, "idle"),
        asleep,
      };
    }),
  };
}

// ── 3) 아침 브리핑 한 줄(읽기) ───────────────────────────────────────────
//    워커가 펫 repo/스테이지 헬퍼를 직접 건드리지 않게, 브리핑용 요약만 노출.

/** 아침 페르소나 컨텍스트용 "이름(스테이지)" 한 줄. 펫 0마리면 undefined. */
export async function getPetBriefingLine(userId: number): Promise<string | undefined> {
  const pets = await petsRepo.listByUser(userId);
  if (pets.length === 0) return undefined;
  return pets
    .slice(0, 8)
    .map((p) => `${p.name}(${stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold)})`)
    .join(", ");
}
