CREATE TABLE "diary_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diary_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_date" date NOT NULL,
	"mood" text,
	"body" text,
	"ai_reply" text,
	"ai_persona" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "diary_entries_entry_date_unique" UNIQUE("entry_date")
);
--> statement-breakpoint
CREATE TABLE "diary_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diary_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_id" bigint,
	"label" text NOT NULL,
	"amount" text,
	"weight" integer
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"alarm_minutes_before" integer,
	"alarm_sent" boolean DEFAULT false,
	"source" text DEFAULT 'local',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "memories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"content" text NOT NULL,
	"source" text,
	"importance" integer DEFAULT 3,
	"last_referenced" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"persona" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_path" text,
	"custom_traits" text
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"active_persona" text DEFAULT 'nora' NOT NULL,
	"proactive_enabled" boolean DEFAULT false,
	"morning_time" time DEFAULT '08:00',
	"evening_time" time DEFAULT '22:00',
	"location_lat" numeric,
	"location_lon" numeric,
	"kma_nx" integer,
	"kma_ny" integer,
	"timezone" text DEFAULT 'Asia/Seoul',
	"openrouter_api_key" text,
	"openrouter_model" text,
	"openrouter_base_url" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tx_date" date NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone,
	"payload" jsonb,
	"has_rain" boolean DEFAULT false,
	"has_snow" boolean DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "diary_items" ADD CONSTRAINT "diary_items_entry_id_diary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."diary_entries"("id") ON DELETE cascade ON UPDATE no action;