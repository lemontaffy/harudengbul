CREATE TABLE "room_furniture" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_furniture_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"type" text DEFAULT 'furniture' NOT NULL,
	"sprite_path" text NOT NULL,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 50 NOT NULL,
	"pixel_render" boolean DEFAULT true NOT NULL,
	"action_type" text
);
--> statement-breakpoint
ALTER TABLE "room_furniture" ADD CONSTRAINT "room_furniture_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "room_furniture_room_idx" ON "room_furniture" USING btree ("room_id");
