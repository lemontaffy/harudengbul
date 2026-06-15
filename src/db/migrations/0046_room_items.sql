CREATE TABLE "room_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" bigint NOT NULL,
	"asset_id" bigint NOT NULL,
	"owner_pet_id" bigint,
	"durability_max" integer,
	"durability_now" integer DEFAULT 0 NOT NULL,
	"broken" boolean DEFAULT false NOT NULL,
	"placed" boolean DEFAULT false NOT NULL,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 70 NOT NULL,
	"scale" real DEFAULT 1 NOT NULL,
	"z_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "room_items" ADD CONSTRAINT "room_items_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_items" ADD CONSTRAINT "room_items_asset_id_items_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_items" ADD CONSTRAINT "room_items_owner_pet_id_pets_id_fk" FOREIGN KEY ("owner_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_items_room_idx" ON "room_items" USING btree ("room_id","placed");--> statement-breakpoint
-- ── v6 expand: 아이템 인스턴스를 room_items 로 복사(상태=인스턴스). 슬라이스 B의 item-배치
--    (furniture_placements, asset.kind='item')에서 내구도·파손·위치·scale·소유 보존, placed=true.
--    ※ fp 의 item 행은 '복사만' — 아직 삭제 안 함(앱이 UI 전환 전까지 fp 로 렌더). 다음 마이그에서 contract.
--    중복 복사 방지: 같은 (room,asset) room_items 가 이미 있으면 건너뜀(재실행·부분상태 안전).
INSERT INTO "room_items" (room_id, asset_id, owner_pet_id, durability_max, durability_now, broken, placed, pos_x, pos_y, scale, z_order, created_at)
  SELECT fp.room_id, i.id, i.owner_pet_id, i.durability_max, i.durability_now,
         (i.durability_max IS NOT NULL AND i.durability_now <= 0), true,
         fp.pos_x, fp.pos_y, fp.scale, fp.z_order, now()
  FROM "furniture_placements" fp
  JOIN "items" i ON i.id = fp.item_id
  WHERE i.kind = 'item'
  AND NOT EXISTS (SELECT 1 FROM "room_items" ri WHERE ri.room_id = fp.room_id AND ri.asset_id = i.id);
