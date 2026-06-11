CREATE TABLE "google_accounts" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"token_expiry" timestamp with time zone,
	"email" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_token" text,
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_google_idx" ON "events" USING btree ("user_id","google_event_id");