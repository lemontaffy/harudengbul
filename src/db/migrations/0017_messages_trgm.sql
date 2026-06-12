-- 과거 대화 검색(search_past_messages)용 트라이그램 인덱스.
-- pgvector 마이그(0008)와 동일하게 EXTENSION 은 migrate 사용자(이미지상 superuser)가 생성.
-- 비-superuser 환경이면 이 한 줄만 DBA가 선실행(pg_trgm 은 trusted 확장이라 DB owner 도 가능).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_content_trgm_idx" ON "messages" USING gin ("content" gin_trgm_ops);
