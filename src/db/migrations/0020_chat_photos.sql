ALTER TABLE "messages" ADD COLUMN "attachment_path" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachment_caption" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "aux_connection_id" bigint;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_aux_connection_id_llm_connections_id_fk" FOREIGN KEY ("aux_connection_id") REFERENCES "public"."llm_connections"("id") ON DELETE set null ON UPDATE no action;