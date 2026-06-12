CREATE TABLE "llm_connections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"api_key" text,
	"base_url" text,
	"model" text,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "active_connection_id" bigint;--> statement-breakpoint
ALTER TABLE "llm_connections" ADD CONSTRAINT "llm_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_conn_user_idx" ON "llm_connections" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_active_connection_id_llm_connections_id_fk" FOREIGN KEY ("active_connection_id") REFERENCES "public"."llm_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "llm_connections" ("user_id","name","api_key","base_url","model","embedding_model")
SELECT "user_id", '기본 연결', "llm_api_key", "llm_base_url", "llm_model", "llm_embedding_model"
FROM "settings"
WHERE COALESCE("llm_api_key", '') <> '' OR COALESCE("llm_base_url", '') <> '' OR COALESCE("llm_model", '') <> '';
--> statement-breakpoint
UPDATE "settings" s
SET "active_connection_id" = c."id"
FROM "llm_connections" c
WHERE c."user_id" = s."user_id";
