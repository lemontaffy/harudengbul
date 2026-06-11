CREATE TABLE "handoff_suggestions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "handoff_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"source_persona_id" bigint,
	"suggested_text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_event_id" bigint,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "handoff_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "handoff_suggestions" ADD CONSTRAINT "handoff_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_suggestions" ADD CONSTRAINT "handoff_suggestions_source_persona_id_personas_id_fk" FOREIGN KEY ("source_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_suggestions" ADD CONSTRAINT "handoff_suggestions_created_event_id_events_id_fk" FOREIGN KEY ("created_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handoff_user_status_idx" ON "handoff_suggestions" USING btree ("user_id","status");