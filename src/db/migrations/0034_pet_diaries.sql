CREATE TABLE "pet_diaries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_diaries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"pet_id" bigint NOT NULL,
	"content" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pet_diaries" ADD CONSTRAINT "pet_diaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pet_diaries" ADD CONSTRAINT "pet_diaries_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "pet_diaries_user_pet_date_idx" ON "pet_diaries" USING btree ("user_id","pet_id","date");
--> statement-breakpoint
CREATE INDEX "pet_diaries_user_date_idx" ON "pet_diaries" USING btree ("user_id","date");
