CREATE TABLE "memos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "memos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"content" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "handoff_suggestions" ADD COLUMN "source_memo_id" bigint;--> statement-breakpoint
ALTER TABLE "memos" ADD CONSTRAINT "memos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memos_user_done_idx" ON "memos" USING btree ("user_id","done","created_at");--> statement-breakpoint
ALTER TABLE "handoff_suggestions" ADD CONSTRAINT "handoff_suggestions_source_memo_id_memos_id_fk" FOREIGN KEY ("source_memo_id") REFERENCES "public"."memos"("id") ON DELETE set null ON UPDATE no action;