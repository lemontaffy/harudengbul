-- settings.hidden_home — 홈 화면에서 숨긴 섹션 키 목록(null = 전부 표시).
-- (drizzle 스냅샷 드리프트로 auto-gen 이 기존 펫/업적 테이블을 재생성하려 해, 이 컬럼 추가만 남김.
--  나머지 테이블은 0033/0037/0039 등 기존 마이그에서 이미 생성됨.)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hidden_home" text[];
