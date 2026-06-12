-- personas.role(text) → personas.roles(text[]). 첫 원소가 주 역할.
-- 기존 단일 role 을 단일 원소 배열로 이행한 뒤, 모든 행이 채워졌는지 검증하고 role 제거.
ALTER TABLE "personas" ADD COLUMN "roles" text[];--> statement-breakpoint
UPDATE "personas" SET "roles" = ARRAY["role"] WHERE "roles" IS NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "personas"
    WHERE "roles" IS NULL OR array_length("roles", 1) IS NULL
  ) THEN
    RAISE EXCEPTION 'personas.roles 이행 실패: roles 가 비어 있는 행이 있습니다';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "roles" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN "role";
