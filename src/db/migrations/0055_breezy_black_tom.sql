ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 핀 조회용 부분 인덱스(고정된 것만). 현재 대화 상대(user_id, persona_id) 스코프.
CREATE INDEX IF NOT EXISTS "messages_pinned_idx" ON "messages" ("user_id","persona_id") WHERE "pinned";--> statement-breakpoint
-- 통합 검색용 트라이그램 인덱스. pg_trgm 확장은 0017 에서 이미 생성됨.
CREATE INDEX IF NOT EXISTS "diary_body_trgm_idx" ON "diary_entries" USING gin ("body" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memos_content_trgm_idx" ON "memos" USING gin ("content" gin_trgm_ops);
