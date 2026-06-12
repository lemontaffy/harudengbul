CREATE TABLE "snooze_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "alarm_snooze_until" timestamp with time zone;