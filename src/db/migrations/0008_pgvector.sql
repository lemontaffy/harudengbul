CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "llm_embedding_model" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_embedding_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);