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
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// DELTA-multiuser: 초대제 멀티유저. SPEC §4의 단일 사용자 전제를 대체한다.
// 모든 사용자 데이터는 user_id로 스코프된다.

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // argon2
  role: text("role").notNull().default("member"), // 'admin' | 'member'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const invites = pgTable("invites", {
  code: text("code").primaryKey(), // 충분히 긴 랜덤(24자)
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  usedBy: bigint("used_by", { mode: "number" }).references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const usageLog = pgTable(
  "usage_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'chat' | 'diary_reply' | 'proactive' | 'memory'
    tokensIn: integer("tokens_in").default(0),
    tokensOut: integer("tokens_out").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("usage_log_user_created_idx").on(t.userId, t.createdAt)],
);

// 전역 OpenRouter 연결(운영자 관리). 멤버는 공유해서 쓴다(크레딧 보호: daily_message_limit).
export const appConfig = pgTable("app_config", {
  id: integer("id").primaryKey().default(1),
  openrouterApiKey: text("openrouter_api_key"),
  openrouterModel: text("openrouter_model"),
  openrouterBaseUrl: text("openrouter_base_url"),
});

// 사용자별 설정 (id=1 단일행 → user_id PK)
export const settings = pgTable("settings", {
  userId: bigint("user_id", { mode: "number" })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activePersona: text("active_persona").notNull().default("nora"),
  proactiveEnabled: boolean("proactive_enabled").default(false),
  morningTime: time("morning_time").default("08:00"),
  eveningTime: time("evening_time").default("22:00"),
  locationLat: numeric("location_lat"),
  locationLon: numeric("location_lon"),
  kmaNx: integer("kma_nx"),
  kmaNy: integer("kma_ny"),
  timezone: text("timezone").default("Asia/Seoul"),
  dailyMessageLimit: integer("daily_message_limit").default(200),
});

// 페르소나: 사용자별 (pk = user_id, id)
export const personas = pgTable(
  "personas",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(), // 'theo' | 'nora'
    displayName: text("display_name"),
    avatarPath: text("avatar_path"),
    customTraits: text("custom_traits"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const messages = pgTable(
  "messages",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    role: text("role").notNull(), // 'user' | 'assistant' | 'proactive'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("messages_user_persona_idx").on(t.userId, t.persona, t.createdAt)],
);

export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    mood: text("mood"), // storm|rain|cloud|haze|sun
    body: text("body"),
    aiReply: text("ai_reply"),
    aiPersona: text("ai_persona"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("diary_user_date_idx").on(t.userId, t.entryDate)],
);

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

export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    alarmMinutesBefore: integer("alarm_minutes_before"),
    alarmSent: boolean("alarm_sent").default(false),
    source: text("source").default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("events_user_starts_idx").on(t.userId, t.startsAt)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    txDate: date("tx_date").notNull(),
    kind: text("kind").notNull(), // 'expense' | 'income'
    category: text("category").notNull(),
    amount: integer("amount").notNull(), // KRW 정수
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("tx_user_date_idx").on(t.userId, t.txDate)],
);

export const memories = pgTable(
  "memories",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source"), // 'chat' | 'diary'
    importance: integer("importance").default(3), // 1~5
    lastReferenced: timestamp("last_referenced", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("memories_user_idx").on(t.userId, t.importance, t.createdAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 격자별 공유 캐시 (사용자별 아님). pk (kma_nx, kma_ny)
export const weatherCache = pgTable(
  "weather_cache",
  {
    kmaNx: integer("kma_nx").notNull(),
    kmaNy: integer("kma_ny").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    payload: jsonb("payload"),
    hasRain: boolean("has_rain").default(false),
    hasSnow: boolean("has_snow").default(false),
  },
  (t) => [primaryKey({ columns: [t.kmaNx, t.kmaNy] })],
);
