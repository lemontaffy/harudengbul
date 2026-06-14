CREATE TABLE "pet_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"room_id" bigint,
	"name" text NOT NULL,
	"sprite_path" text NOT NULL,
	"pixel_render" boolean DEFAULT true NOT NULL,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 70 NOT NULL,
	"durability_max" integer,
	"durability_now" integer DEFAULT 0 NOT NULL,
	"held_by_pet_id" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "item_reactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_reactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"item_id" bigint NOT NULL,
	"pet_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "item_reaction_freq" text DEFAULT 'sometimes' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pet_items" ADD CONSTRAINT "pet_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_items" ADD CONSTRAINT "pet_items_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_items" ADD CONSTRAINT "pet_items_held_by_pet_id_pets_id_fk" FOREIGN KEY ("held_by_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_reactions" ADD CONSTRAINT "item_reactions_item_id_pet_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pet_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_reactions" ADD CONSTRAINT "item_reactions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pet_items_user_room_idx" ON "pet_items" USING btree ("user_id","room_id");
--> statement-breakpoint
CREATE INDEX "item_reactions_item_pet_kind_idx" ON "item_reactions" USING btree ("item_id","pet_id","kind");
