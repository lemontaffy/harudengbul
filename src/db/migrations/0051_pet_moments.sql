-- 의도한 변경만: pet_moments 신규. (생성기가 스냅샷 드리프트로 pet_room_memberships·events·items.consumable
--  재생성 SQL을 함께 뽑았으나 그것들은 0048~0050에서 이미 적용됨 → 제거. 스냅샷은 auto-gen 그대로 유지해 드리프트 복구.)
CREATE TABLE "pet_moments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_moments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"room_id" bigint,
	"pet_a_id" bigint,
	"pet_b_id" bigint,
	"pet_a_name" text NOT NULL,
	"pet_b_name" text NOT NULL,
	"relation_kind" text NOT NULL,
	"script" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pet_moments" ADD CONSTRAINT "pet_moments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_moments" ADD CONSTRAINT "pet_moments_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_moments" ADD CONSTRAINT "pet_moments_pet_a_id_pets_id_fk" FOREIGN KEY ("pet_a_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_moments" ADD CONSTRAINT "pet_moments_pet_b_id_pets_id_fk" FOREIGN KEY ("pet_b_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_moments_user_created_idx" ON "pet_moments" USING btree ("user_id","created_at");
