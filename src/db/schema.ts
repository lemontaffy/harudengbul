import {
  pgTable,
  integer,
  bigint,
  text,
  boolean,
  time,
  numeric,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

// SPEC §4 스키마. 단일 사용자 전제 — user_id 없음.
// DB 레벨 check 제약은 생략하고 앱(zod)에서 검증한다(드라이버/버전 호환 단순화).

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  activePersona: text("active_persona").notNull().default("nora"), // 'theo' | 'nora'
  proactiveEnabled: boolean("proactive_enabled").default(false),
  morningTime: time("morning_time").default("08:00"),
  eveningTime: time("evening_time").default("22:00"),
  locationLat: numeric("location_lat"),
  locationLon: numeric("location_lon"),
  kmaNx: integer("kma_nx"),
  kmaNy: integer("kma_ny"),
  timezone: text("timezone").default("Asia/Seoul"),
  // SPEC 외 추가(의도적 deviation): GUI에서 OpenRouter 연결 설정을 편집.
  // 비어 있으면 env(OPENROUTER_API_KEY / OPENROUTER_MODEL)로 폴백한다.
  openrouterApiKey: text("openrouter_api_key"),
  openrouterModel: text("openrouter_model"),
  openrouterBaseUrl: text("openrouter_base_url"),
});

export const personas = pgTable("personas", {
  id: text("id").primaryKey(), // 'theo' | 'nora'
  displayName: text("display_name"),
  avatarPath: text("avatar_path"),
  customTraits: text("custom_traits"),
});

export const messages = pgTable("messages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  persona: text("persona").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'proactive'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const diaryEntries = pgTable("diary_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  entryDate: date("entry_date").notNull().unique(),
  mood: text("mood"), // storm|rain|cloud|haze|sun
  body: text("body"),
  aiReply: text("ai_reply"),
  aiPersona: text("ai_persona"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const diaryItems = pgTable("diary_items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  entryId: bigint("entry_id", { mode: "number" }).references(
    () => diaryEntries.id,
    { onDelete: "cascade" },
  ),
  label: text("label").notNull(),
  amount: text("amount"),
  weight: integer("weight"), // 1~5
});

export const events = pgTable("events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  alarmMinutesBefore: integer("alarm_minutes_before"),
  alarmSent: boolean("alarm_sent").default(false),
  source: text("source").default("local"), // 'local' | 'google'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  txDate: date("tx_date").notNull(),
  kind: text("kind").notNull(), // 'expense' | 'income'
  category: text("category").notNull(),
  amount: integer("amount").notNull(), // KRW 정수
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const memories = pgTable("memories", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  content: text("content").notNull(),
  source: text("source"), // 'chat' | 'diary'
  importance: integer("importance").default(3), // 1~5
  lastReferenced: timestamp("last_referenced", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const weatherCache = pgTable("weather_cache", {
  id: integer("id").primaryKey().default(1),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  payload: jsonb("payload"),
  hasRain: boolean("has_rain").default(false),
  hasSnow: boolean("has_snow").default(false),
});
