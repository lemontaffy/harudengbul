ALTER TABLE "settings" ADD COLUMN "diary_reminder_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "diary_reminder_time" time DEFAULT '21:30';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "diary_reminder_persona_id" bigint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "diary_reminder_last_sent" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "diary_reminder_no_write_streak" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_diary_reminder_persona_id_personas_id_fk" FOREIGN KEY ("diary_reminder_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;