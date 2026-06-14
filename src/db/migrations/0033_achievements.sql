CREATE TABLE "achievements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "achievements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"title" text NOT NULL,
	"source_persona_id" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "achievement_suggestions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "achievement_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"source_persona_id" bigint,
	"suggested_text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_achievement_id" bigint,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_source_persona_id_personas_id_fk" FOREIGN KEY ("source_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "achievement_suggestions" ADD CONSTRAINT "achievement_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "achievement_suggestions" ADD CONSTRAINT "achievement_suggestions_source_persona_id_personas_id_fk" FOREIGN KEY ("source_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "achievement_suggestions" ADD CONSTRAINT "achievement_suggestions_created_achievement_id_achievements_id_fk" FOREIGN KEY ("created_achievement_id") REFERENCES "public"."achievements"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "achievements_user_idx" ON "achievements" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "achievement_sugg_user_status_idx" ON "achievement_suggestions" USING btree ("user_id","status");
