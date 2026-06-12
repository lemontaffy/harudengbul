import type { Stage } from "@/lib/pets";

export interface PetVM {
  id: number;
  name: string;
  posX: number;
  posY: number;
  pixelRender: boolean;
  stage: Stage;
  spritePath: string | null; // idle(폴백 적용)
  sleepPath: string | null;
  lovePath: string | null;
  evolutionPending: boolean;
  soloLines: string[];
  aboutLines: { aboutPetId: number; content: string }[];
}

export interface RoomVM {
  id: number;
  name: string;
  backgroundPath: string | null;
  pixelRenderBg: boolean;
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
