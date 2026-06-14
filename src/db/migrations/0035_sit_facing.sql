ALTER TABLE "pets" ADD COLUMN "sit_facing" text DEFAULT 'left' NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_furniture" ADD COLUMN "facing" text DEFAULT 'left' NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_furniture" ADD COLUMN "seat_y" real DEFAULT 40 NOT NULL;
