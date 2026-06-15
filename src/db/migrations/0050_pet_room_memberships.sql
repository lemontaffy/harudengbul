CREATE TABLE "pet_room_memberships" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_room_memberships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pet_id" bigint NOT NULL,
	"room_id" bigint NOT NULL,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 70 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pet_room_memberships" ADD CONSTRAINT "pet_room_memberships_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_room_memberships" ADD CONSTRAINT "pet_room_memberships_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "pet_room_memberships_pair_idx" ON "pet_room_memberships" USING btree ("pet_id","room_id");
--> statement-breakpoint
CREATE INDEX "pet_room_memberships_room_idx" ON "pet_room_memberships" USING btree ("room_id");
--> statement-breakpoint
INSERT INTO "pet_room_memberships" ("pet_id", "room_id", "pos_x", "pos_y")
SELECT "id", "room_id", "pos_x", "pos_y" FROM "pets" WHERE "room_id" IS NOT NULL;
