-- 펫 전역화: pets.room_id 를 nullable + FK ON DELETE SET NULL 로.
-- 기존 room_id 값은 보존(제약·nullability 만 변경, 데이터 변경 없음).
-- breakpoint 없이 한 덩어리로 실행 → 단일 암묵 트랜잭션(하나라도 실패하면 전체 롤백).
ALTER TABLE "pets" DROP CONSTRAINT "pets_room_id_pet_rooms_id_fk";
ALTER TABLE "pets" ALTER COLUMN "room_id" DROP NOT NULL;
ALTER TABLE "pets" ADD CONSTRAINT "pets_room_id_pet_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pet_rooms"("id") ON DELETE set null ON UPDATE no action;
