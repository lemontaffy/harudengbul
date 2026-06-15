ALTER TABLE "events" ADD COLUMN "category" text DEFAULT 'oneoff' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_date" date;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "events_user_category_active_idx" ON "events" USING btree ("user_id","category","active");
