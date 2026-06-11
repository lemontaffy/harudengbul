ALTER TABLE "settings" ADD COLUMN "last_morning_sent" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "last_evening_sent" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "daily_phrase" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "daily_phrase_date" date;