-- ── v6 contract: 방 페이지가 room_items 로 전환됨. furniture_placements 의 item 행은 이제 미사용 → 정리.
-- 안전: 0046(expand) 이후 새로 생긴 fp item 행이 있으면 room_items 로 보강(copy-missing) 후 삭제.
-- 가구(asset.kind='furniture') 배치 행은 유지. 레거시 pet_items 는 보존(삭제 안 함). 저널 1회.

-- (1) room_items 에 아직 없는 fp item 행 보강(0046 이후 신규분 대비).
INSERT INTO "room_items" (room_id, asset_id, owner_pet_id, durability_max, durability_now, broken, placed, pos_x, pos_y, scale, z_order, created_at)
  SELECT fp.room_id, i.id, i.owner_pet_id, i.durability_max, i.durability_now,
         (i.durability_max IS NOT NULL AND i.durability_now <= 0), true,
         fp.pos_x, fp.pos_y, fp.scale, fp.z_order, now()
  FROM "furniture_placements" fp
  JOIN "items" i ON i.id = fp.item_id
  WHERE i.kind = 'item'
  AND NOT EXISTS (SELECT 1 FROM "room_items" ri WHERE ri.room_id = fp.room_id AND ri.asset_id = i.id);--> statement-breakpoint

-- (2) fp 의 item 행 삭제(가구 행만 남김). 데이터는 room_items 로 이미 이관됨.
DELETE FROM "furniture_placements" fp USING "items" i WHERE i.id = fp.item_id AND i.kind = 'item';
