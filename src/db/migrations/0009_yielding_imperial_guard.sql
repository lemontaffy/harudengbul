ALTER TABLE "events" ADD COLUMN "alarm_keep_minutes" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "alarm_last_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "alarm_acked" boolean DEFAULT false;