CREATE TABLE "preorders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "preorders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"deposit_amount" numeric(12, 2),
	"deposit_krw" integer NOT NULL,
	"deposit_date" date NOT NULL,
	"balance_amount" numeric(12, 2),
	"balance_krw_estimate" integer DEFAULT 0 NOT NULL,
	"balance_due_date" date NOT NULL,
	"balance_krw_actual" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"deposit_txn_id" bigint,
	"balance_txn_id" bigint,
	"reminder_id" bigint,
	"created_at" timestamp with time zone DEFAULT now(),
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_deposit_txn_id_transactions_id_fk" FOREIGN KEY ("deposit_txn_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_balance_txn_id_transactions_id_fk" FOREIGN KEY ("balance_txn_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_reminder_id_events_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preorders_user_status_idx" ON "preorders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "preorders_user_due_idx" ON "preorders" USING btree ("user_id","balance_due_date");