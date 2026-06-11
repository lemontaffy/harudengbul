-- 0001: 페르소나 역할/캐릭터 분리 + 커스텀 캐릭터
--   personas 재설계(자동 id pk, role, is_active), messages.persona→persona_id,
--   settings 트리거 담당(active/diary_reply/morning/evening) 추가.
--   데이터 보존 이전: 노라→counselor, 테오→secretary.
-- drizzle-kit 자동생성은 파괴적(drop)이라 데이터 이전을 위해 직접 작성한다.

-- 1) personas 재구성 (현재 personas에는 인바운드 FK가 없어 rename 안전).
--    임시 legacy_id 로 구 텍스트 id('theo'|'nora')를 보관 → messages/settings 백필에 사용.
ALTER TABLE "personas" RENAME TO "personas_old";
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text,
	"role" text NOT NULL,
	"avatar_path" text,
	"traits" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"legacy_id" text
);
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "personas" ("user_id", "name", "role", "avatar_path", "traits", "is_active", "created_at", "legacy_id")
SELECT "user_id",
       "display_name",
       CASE "id" WHEN 'nora' THEN 'counselor' WHEN 'theo' THEN 'secretary' ELSE 'counselor' END,
       "avatar_path",
       "custom_traits",
       true,
       now(),
       "id"
FROM "personas_old";
--> statement-breakpoint
CREATE INDEX "personas_user_active_idx" ON "personas" USING btree ("user_id","is_active");
--> statement-breakpoint
-- 2) messages.persona(text) → persona_id(fk). 구 텍스트를 legacy_id로 조인해 백필.
DROP INDEX "messages_user_persona_idx";
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "persona_id" bigint;
--> statement-breakpoint
UPDATE "messages" m
SET "persona_id" = p."id"
FROM "personas" p
WHERE p."user_id" = m."user_id" AND p."legacy_id" = m."persona";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "persona_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "persona";
--> statement-breakpoint
CREATE INDEX "messages_user_persona_idx" ON "messages" USING btree ("user_id","persona_id","created_at");
--> statement-breakpoint
-- 3) settings 트리거 담당 컬럼 + active_persona_id. 기본값: 상담가/비서/상담가의 첫 캐릭터.
ALTER TABLE "settings" ADD COLUMN "active_persona_id" bigint;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "diary_reply_persona_id" bigint;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "morning_persona_id" bigint;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "evening_persona_id" bigint;
--> statement-breakpoint
UPDATE "settings" s
SET "active_persona_id" = p."id"
FROM "personas" p
WHERE p."user_id" = s."user_id" AND p."legacy_id" = s."active_persona";
--> statement-breakpoint
UPDATE "settings" s
SET "diary_reply_persona_id" = (
	SELECT MIN(p."id") FROM "personas" p
	WHERE p."user_id" = s."user_id" AND p."role" = 'counselor'
);
--> statement-breakpoint
UPDATE "settings" s
SET "morning_persona_id" = (
	SELECT MIN(p."id") FROM "personas" p
	WHERE p."user_id" = s."user_id" AND p."role" = 'secretary'
);
--> statement-breakpoint
UPDATE "settings" s
SET "evening_persona_id" = (
	SELECT MIN(p."id") FROM "personas" p
	WHERE p."user_id" = s."user_id" AND p."role" = 'counselor'
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_active_persona_id_personas_id_fk" FOREIGN KEY ("active_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_diary_reply_persona_id_personas_id_fk" FOREIGN KEY ("diary_reply_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_morning_persona_id_personas_id_fk" FOREIGN KEY ("morning_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_evening_persona_id_personas_id_fk" FOREIGN KEY ("evening_persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "active_persona";
--> statement-breakpoint
-- 4) 임시 컬럼/구 테이블 정리.
ALTER TABLE "personas" DROP COLUMN "legacy_id";
--> statement-breakpoint
DROP TABLE "personas_old";