CREATE TABLE "time_capsules" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_capsules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"persona_id" bigint,
	"content" text NOT NULL,
	"deliver_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "time_capsules" ADD CONSTRAINT "time_capsules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_capsules" ADD CONSTRAINT "time_capsules_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_capsules_user_idx" ON "time_capsules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_capsules_due_idx" ON "time_capsules" USING btree ("deliver_on","delivered_at");