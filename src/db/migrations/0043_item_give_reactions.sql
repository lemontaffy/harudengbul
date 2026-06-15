CREATE TABLE "item_gives" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_gives_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"pet_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_reaction_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_reaction_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"item_id" bigint NOT NULL,
	"pet_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "owner_call_date" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "owner_call_today" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "item_gives" ADD CONSTRAINT "item_gives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_gives" ADD CONSTRAINT "item_gives_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_gives" ADD CONSTRAINT "item_gives_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_reaction_lines" ADD CONSTRAINT "item_reaction_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_reaction_lines" ADD CONSTRAINT "item_reaction_lines_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_gives_user_pet_item_idx" ON "item_gives" USING btree ("user_id","pet_id","item_id","given_at");--> statement-breakpoint
CREATE INDEX "item_reaction_lines_item_pet_kind_idx" ON "item_reaction_lines" USING btree ("item_id","pet_id","kind");