-- 통합 검색을 채팅방 내 검색으로 좁히면서 일기·메모 trgm 인덱스는 불필요해짐(0055에서 추가했던 것).
-- 채팅(messages) trgm 인덱스(0017)와 핀 인덱스(0055)는 계속 사용하므로 그대로 둔다.
DROP INDEX IF EXISTS "diary_body_trgm_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memos_content_trgm_idx";
