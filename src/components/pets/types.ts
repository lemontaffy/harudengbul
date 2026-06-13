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
  locomotion: "ground" | "air"; // ground=바닥 구역 / air=비행(부엉이류)
  spritePath: string | null; // idle(표시 스테이지, 폴백 적용)
  walkPath: string | null; // walk 슬롯(있어야 산책 자격)
  sitPath: string | null; // sit 슬롯(있어야 가구에 앉음)
  sleepPath: string | null;
  lovePath: string | null;
  evolutionPending: boolean;
  soloLines: string[];
  wakeLines: string[]; // 자다 깨면 놀라는 대사(없으면 solo 폴백)
  aboutLines: { aboutPetId: number; content: string }[];
  customs: PetCustomVM[]; // 표시 스테이지에 해당하는 커스텀 모션
}

export interface RoomPanel {
  id: number;
  path: string;
  pixelRender: boolean;
  floorTopY: number; // 바닥 구역 위 경계(%)
  floorBottomY: number; // 바닥 구역 아래 경계(%)
}

export interface RoomVM {
  id: number;
  name: string;
  liveliness: number; // 방 전역 분주함(0~100)
  panels: RoomPanel[]; // 가로 스트립(정렬됨). 비면 기본 그라데이션.
  furniture: FurnitureVM[]; // 배치된 가구(seat/fixture)
}

export interface FurnitureVM {
  id: number;
  kind: "seat" | "fixture";
  type: string;
  spritePath: string;
  spriteAltPath: string | null; // 상태 active 일 때 스프라이트(우체통 열림 등)
  posX: number;
  posY: number;
  pixelRender: boolean;
  actionType: string | null; // fixture: 'letters'|'memo'|'diary'|'none'
  active: boolean; // 상태 활성(예: 안 읽은 편지) — alt 스프라이트로 전환
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
