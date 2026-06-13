CREATE TABLE "pet_custom_sprites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_custom_sprites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pet_id" bigint NOT NULL,
	"stage" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"frequency" text DEFAULT 'sometimes' NOT NULL,
	"line" text
);
--> statement-breakpoint
CREATE TABLE "room_backgrounds" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_backgrounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" bigint NOT NULL,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"pixel_render" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "talkativeness" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "display_stage" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "walk_facing" text DEFAULT 'left' NOT NULL;--> statement-breakpoint
ALTER TABLE "pet_custom_sprites" ADD CONSTRAINT "pet_custom_sprites_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_backgrounds" ADD CONSTRAINT "room_backgrounds_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_custom_pet_idx" ON "pet_custom_sprites" USING btree ("pet_id","stage");--> statement-breakpoint
CREATE INDEX "room_bg_room_idx" ON "room_backgrounds" USING btree ("room_id","sort_order");--> statement-breakpoint
INSERT INTO "room_backgrounds" ("room_id", "path", "sort_order", "pixel_render") SELECT "id", "background_path", 0, "pixel_render_bg" FROM "pet_rooms" WHERE "background_path" IS NOT NULL;
