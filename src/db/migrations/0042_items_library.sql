CREATE TABLE "furniture_placements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "furniture_placements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 50 NOT NULL,
	"z_order" integer DEFAULT 0 NOT NULL,
	"scale" real DEFAULT 1 NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sprite_path" text NOT NULL,
	"owner_pet_id" bigint,
	"pixel_render" boolean DEFAULT true NOT NULL,
	"furniture_kind" text,
	"type" text,
	"sprite_alt_path" text,
	"action_type" text,
	"facing" text DEFAULT 'left' NOT NULL,
	"seat_y" real DEFAULT 40 NOT NULL,
	"broken_sprite_path" text,
	"durability_max" integer,
	"durability_now" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "furniture_placements" ADD CONSTRAINT "furniture_placements_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "furniture_placements" ADD CONSTRAINT "furniture_placements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_owner_pet_id_pets_id_fk" FOREIGN KEY ("owner_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "furniture_placements_room_idx" ON "furniture_placements" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "items_user_kind_idx" ON "items" USING btree ("user_id","kind");--> statement-breakpoint
-- ── 데이터 이관(손실 0) ──────────────────────────────────────────────
-- room_furniture / pet_items 를 전역 items + furniture_placements 로 통합.
-- 레거시 테이블은 Phase 2(방 화면을 새 모델로 전환)까지 보존 — 여기선 복사만.
-- 이 마이그는 저널로 1회만 실행되므로 중복 복사 없음. fresh DB 는 원본이 비어 0행 복사.
-- 가구: room_furniture → items(kind='furniture') + furniture_placements (1:1).
ALTER TABLE "items" ADD COLUMN "_legacy_rf_id" bigint;--> statement-breakpoint
INSERT INTO "items" (user_id, name, kind, sprite_path, pixel_render, furniture_kind, type, sprite_alt_path, action_type, facing, seat_y, created_at, _legacy_rf_id)
  SELECT pr.user_id, COALESCE(NULLIF(rf.type, ''), '가구'), 'furniture', rf.sprite_path, rf.pixel_render,
         rf.kind, rf.type, rf.sprite_alt_path, rf.action_type, rf.facing, rf.seat_y, now(), rf.id
  FROM "room_furniture" rf JOIN "pet_rooms" pr ON pr.id = rf.room_id;--> statement-breakpoint
INSERT INTO "furniture_placements" (room_id, item_id, pos_x, pos_y, z_order, scale, rotation)
  SELECT rf.room_id, i.id, rf.pos_x, rf.pos_y, 0, rf.scale, rf.rotation
  FROM "room_furniture" rf JOIN "items" i ON i._legacy_rf_id = rf.id;--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "_legacy_rf_id";--> statement-breakpoint
-- 아이템: pet_items → items(kind='item'). 방에 놓였던 아이템도 라이브러리 아이템으로(방 위치 버림).
--   owner = held_by_pet_id (들고 있던 펫이 소유자). 반응(item_reactions)은 레거시 유지 → Phase 2/다음 블록.
INSERT INTO "items" (user_id, name, kind, sprite_path, pixel_render, owner_pet_id, broken_sprite_path, durability_max, durability_now, created_at)
  SELECT user_id, name, 'item', sprite_path, pixel_render, held_by_pet_id, broken_sprite_path, durability_max, durability_now, created_at
  FROM "pet_items";