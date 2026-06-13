ALTER TABLE "settings" ADD COLUMN "letter_connection_id" bigint;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "letters_per_day" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_letter_connection_id_llm_connections_id_fk" FOREIGN KEY ("letter_connection_id") REFERENCES "public"."llm_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "pet_letters" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_letters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"to_pet_id" bigint,
	"content" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pet_letter_replies" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_letter_replies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"letter_id" bigint NOT NULL,
	"pet_id" bigint NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pet_letters" ADD CONSTRAINT "pet_letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_letters" ADD CONSTRAINT "pet_letters_to_pet_id_pets_id_fk" FOREIGN KEY ("to_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_letter_replies" ADD CONSTRAINT "pet_letter_replies_letter_id_pet_letters_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."pet_letters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_letter_replies" ADD CONSTRAINT "pet_letter_replies_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pet_letters_user_sent_idx" ON "pet_letters" USING btree ("user_id","sent_at");
--> statement-breakpoint
CREATE INDEX "pet_letter_replies_due_idx" ON "pet_letter_replies" USING btree ("status","deliver_at");
