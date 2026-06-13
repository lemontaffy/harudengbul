import type { Stage } from "@/lib/pets";

export interface PetCustomVM {
  id: number;
  name: string;
  path: string;
  frequency: "often" | "sometimes" | "manual";
  line: string | null;
}

export interface PetVM {
  id: number;
  name: string;
  posX: number; // 집 위치 — 스트립 전체 기준 % (산책은 세션 연출, 저장 안 함)
  posY: number;
  pixelRender: boolean;
  walkFacing: "left" | "right";
  talkativeness: number;
  activeness: number; // 펫별 기질(배회·핑퐁 빈도)
  displayStage: Stage; // 표시 스테이지(display_stage 우선)
  spritePath: string | null; // idle(표시 스테이지, 폴백 적용)
  walkPath: string | null; // walk 슬롯(있어야 산책 자격)
  sleepPath: string | null;
  lovePath: string | null;
  evolutionPending: boolean;
  soloLines: string[];
  aboutLines: { aboutPetId: number; content: string }[];
  customs: PetCustomVM[]; // 표시 스테이지에 해당하는 커스텀 모션
}

export interface RoomPanel {
  id: number;
  path: string;
  pixelRender: boolean;
}

export interface RoomVM {
  id: number;
  name: string;
  liveliness: number; // 방 전역 분주함(0~100)
  panels: RoomPanel[]; // 가로 스트립(정렬됨). 비면 기본 그라데이션.
}

export interface RelationVM {
  petAId: number;
  petBId: number;
  label: string;
  isLove: boolean;
}

export interface PetRef {
  id: number;
  name: string;
}
