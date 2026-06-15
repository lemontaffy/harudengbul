-- ── v3 통일: 배치된 pet_items 를 전역 items + furniture_placements 로 (무손실, 레거시 보존) ──
-- 0042에서 pet_items→items(kind='item') 복사됨(위치 제외). 여기서 '방에 배치된' 것의 위치·크기를 placement 로.
-- 0042 이후 새로 생긴 pet_items(items 복사본 없음)는 먼저 items 로 보강 → 손실 0.
-- 저널로 1회만 실행. fresh DB 는 pet_items 비어 0행. 레거시 pet_items/room_furniture 테이블은 삭제 안 함.

-- (1) items 복사본이 없는 pet_items 를 items 로 보강(sprite_path 로 매칭, 없을 때만).
INSERT INTO "items" (user_id, name, kind, sprite_path, pixel_render, owner_pet_id, broken_sprite_path, durability_max, durability_now, created_at)
  SELECT pi.user_id, pi.name, 'item', pi.sprite_path, pi.pixel_render, pi.held_by_pet_id, pi.broken_sprite_path, pi.durability_max, pi.durability_now, pi.created_at
  FROM "pet_items" pi
  WHERE NOT EXISTS (
    SELECT 1 FROM "items" i WHERE i.user_id = pi.user_id AND i.kind = 'item' AND i.sprite_path = pi.sprite_path
  );--> statement-breakpoint

-- (2) 방에 배치된 pet_items 를 furniture_placements 로(위치·크기 보존). 이미 같은 방·item 배치 있으면 건너뜀(재실행 안전).
INSERT INTO "furniture_placements" (room_id, item_id, pos_x, pos_y, z_order, scale, rotation)
  SELECT pi.room_id, i.id, pi.pos_x, pi.pos_y, 0, pi.scale, 0
  FROM "pet_items" pi
  JOIN "items" i ON i.user_id = pi.user_id AND i.kind = 'item' AND i.sprite_path = pi.sprite_path
  WHERE pi.room_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "furniture_placements" fp WHERE fp.room_id = pi.room_id AND fp.item_id = i.id
  );
