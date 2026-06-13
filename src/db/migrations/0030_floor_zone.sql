ALTER TABLE "room_backgrounds" ADD COLUMN "floor_top_y" real DEFAULT 72 NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_backgrounds" ADD COLUMN "floor_bottom_y" real DEFAULT 92 NOT NULL;
--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "locomotion" text DEFAULT 'ground' NOT NULL;
--> statement-breakpoint
-- 기존 데이터 이행(최초 1회): 바닥 구역 밖(하늘 등)에 떠 있던 펫을 기본 구역[72~92] 안으로 보정.
UPDATE "pets" SET "pos_y" = LEAST(92, GREATEST(72, "pos_y")) WHERE "pos_y" < 72 OR "pos_y" > 92;
