CREATE TABLE "pet_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pet_id" bigint NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"about_pet_id" bigint,
	"content" text NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_relations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_relations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"pet_a_id" bigint NOT NULL,
	"pet_b_id" bigint NOT NULL,
	"relation_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_rooms" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_rooms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"background_path" text,
	"pixel_render_bg" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pet_sprites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_sprites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pet_id" bigint NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"room_id" bigint NOT NULL,
	"name" text NOT NULL,
	"personality" text,
	"pos_x" real DEFAULT 50 NOT NULL,
	"pos_y" real DEFAULT 70 NOT NULL,
	"pixel_render" boolean DEFAULT true NOT NULL,
	"growth_points" integer DEFAULT 0 NOT NULL,
	"teen_threshold" integer DEFAULT 30 NOT NULL,
	"adult_threshold" integer DEFAULT 90 NOT NULL,
	"last_stage_seen" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "growth_date" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "growth_today" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pet_last_room_id" bigint;--> statement-breakpoint
ALTER TABLE "pet_lines" ADD CONSTRAINT "pet_lines_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_lines" ADD CONSTRAINT "pet_lines_about_pet_id_pets_id_fk" FOREIGN KEY ("about_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_relations" ADD CONSTRAINT "pet_relations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_relations" ADD CONSTRAINT "pet_relations_pet_a_id_pets_id_fk" FOREIGN KEY ("pet_a_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_relations" ADD CONSTRAINT "pet_relations_pet_b_id_pets_id_fk" FOREIGN KEY ("pet_b_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_rooms" ADD CONSTRAINT "pet_rooms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_sprites" ADD CONSTRAINT "pet_sprites_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_lines_pet_stage_idx" ON "pet_lines" USING btree ("pet_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_relations_pair_idx" ON "pet_relations" USING btree ("user_id","pet_a_id","pet_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_sprites_slot_idx" ON "pet_sprites" USING btree ("pet_id","stage","kind");--> statement-breakpoint
CREATE INDEX "pets_user_room_idx" ON "pets" USING btree ("user_id","room_id");