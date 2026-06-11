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
  // 임시 비밀번호(관리자 초기화/CLI) = 일회용 → 다음 로그인 시 변경 강제
  mustChangePassword: boolean("must_change_password").notNull().default(false),
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

// 사용자별 설정 (id=1 단일행 → user_id PK)
// AI 연결은 사용자별(OAI 호환): 공급사 = base_url. 전역 공유 없음.
export const settings = pgTable("settings", {
  userId: bigint("user_id", { mode: "number" })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // 채팅 상단에서 현재 보고 있는 캐릭터(persona id). 캐릭터 보관(soft delete) 대비 set null.
  activePersonaId: bigint("active_persona_id", { mode: "number" }).references(
    () => personas.id,
    { onDelete: "set null" },
  ),
  // 트리거별 담당 캐릭터 (기본값: 상담가/비서/상담가 중 해당 역할의 첫 캐릭터)
  diaryReplyPersonaId: bigint("diary_reply_persona_id", {
    mode: "number",
  }).references(() => personas.id, { onDelete: "set null" }),
  morningPersonaId: bigint("morning_persona_id", { mode: "number" }).references(
    () => personas.id,
    { onDelete: "set null" },
  ),
  eveningPersonaId: bigint("evening_persona_id", { mode: "number" }).references(
    () => personas.id,
    { onDelete: "set null" },
  ),
  // 내 프로필 — AI가 나를 부르는 호칭 + 소개(프롬프트 컨텍스트) + 내 아바타
  nickname: text("nickname"),
  about: text("about"),
  userAvatarPath: text("user_avatar_path"),
  proactiveEnabled: boolean("proactive_enabled").default(false),
  morningTime: time("morning_time").default("08:00"),
  eveningTime: time("evening_time").default("22:00"),
  locationLat: numeric("location_lat"),
  locationLon: numeric("location_lon"),
  kmaNx: integer("kma_nx"),
  kmaNy: integer("kma_ny"),
  timezone: text("timezone").default("Asia/Seoul"),
  // OpenAI 호환 LLM 연결(사용자별). 공급사는 base_url로 구분
  // (OpenRouter https://openrouter.ai/api/v1, DeepSeek https://api.deepseek.com 등)
  llmApiKey: text("llm_api_key"),
  llmBaseUrl: text("llm_base_url"),
  llmModel: text("llm_model"),
});

// 캐릭터(persona): 사용자 소유. 역할(role)과 캐릭터(이름·성격)를 분리.
//  - role 은 고정 2종: 'counselor'(상담가) | 'secretary'(비서)
//  - 한 역할에 여러 캐릭터 가능. 삭제 대신 is_active=false 로 보관(대화 기록 보존).
export const personas = pgTable(
  "personas",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    role: text("role").notNull(), // 'counselor' | 'secretary'
    avatarPath: text("avatar_path"),
    traits: text("traits"), // 자유 텍스트(구 custom_traits)
    isActive: boolean("is_active").notNull().default(true),
    // 이 캐릭터 스레드를 마지막으로 본 시각(안읽음 배지 계산용)
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("personas_user_active_idx").on(t.userId, t.isActive)],
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
    personaId: bigint("persona_id", { mode: "number" })
      .notNull()
      .references(() => personas.id),
    role: text("role").notNull(), // 'user' | 'assistant' | 'proactive'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("messages_user_persona_idx").on(
      t.userId,
      t.personaId,
      t.createdAt,
    ),
  ],
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
