ALTER TABLE "pet_rooms" ADD COLUMN "liveliness" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activeness" integer DEFAULT 30 NOT NULL;