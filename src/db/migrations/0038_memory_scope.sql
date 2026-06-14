ALTER TABLE "memories" ADD COLUMN "scope" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "pet_id" bigint;
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "memories_user_scope_idx" ON "memories" USING btree ("user_id","scope","pet_id");
