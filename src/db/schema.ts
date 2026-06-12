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
  vector,
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
  // proactive 선제 톡 일자별 중복 발송 방지(사용자 tz 기준 날짜)
  lastMorningSent: date("last_morning_sent"),
  lastEveningSent: date("last_evening_sent"),
  // 생성형 "한마디" 하루 1회 캐시
  dailyPhrase: text("daily_phrase"),
  dailyPhraseDate: date("daily_phrase_date"),
  // memoryJob 워터마크 — 여기까지 기억 추출 처리됨(이후 id만 새로 처리)
  memoryLastMsgId: bigint("memory_last_msg_id", { mode: "number" }).default(0),
  memoryLastDiaryId: bigint("memory_last_diary_id", { mode: "number" }).default(0),
  // 상담→비서 핸드오프 제안 기능 on/off(기본 on). off면 도구·프롬프트 모두 미주입.
  handoffEnabled: boolean("handoff_enabled").default(true),
  locationLat: numeric("location_lat"),
  locationLon: numeric("location_lon"),
  kmaNx: integer("kma_nx"),
  kmaNy: integer("kma_ny"),
  timezone: text("timezone").default("Asia/Seoul"),
  // 메인 LLM 연결 → llm_connections.id. 연결 삭제 시 set null.
  activeConnectionId: bigint("active_connection_id", { mode: "number" }).references(
    () => llmConnections.id,
    { onDelete: "set null" },
  ),
  // [레거시] 단일 연결 컬럼 — 다중 연결(llm_connections)로 이관됨. 폴백/하위호환용 유지.
  llmApiKey: text("llm_api_key"),
  llmBaseUrl: text("llm_base_url"),
  llmModel: text("llm_model"),
  llmEmbeddingModel: text("llm_embedding_model"),
});

// 사용자별 다중 LLM 연결. 같은 공급사도 여러 개 가능. 사용자가 이름을 붙인다.
export const llmConnections = pgTable(
  "llm_connections",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // 사용자 라벨(예: "딥시크 프로")
    apiKey: text("api_key"), // 암호화 저장(crypto)
    baseUrl: text("base_url"),
    model: text("model"),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("llm_conn_user_idx").on(t.userId, t.createdAt)],
);

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
    // 응답 생성 중 도구(add_event 등)를 실제로 호출했는지 — 재생성 차단/삭제 경고용.
    hadToolCall: boolean("had_tool_call").notNull().default(false),
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
    bodyCondition: text("body_condition"), // sick|tired|normal|energetic — 기분 보정 해석용
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
    // 반복 알림(스누즈): keep 분 동안 ack 전까지 주기 재알림.
    alarmKeepMinutes: integer("alarm_keep_minutes"), // null/0 = 단발(반복 없음)
    alarmLastNotifiedAt: timestamp("alarm_last_notified_at", { withTimezone: true }),
    alarmAcked: boolean("alarm_acked").default(false), // 사용자가 확인(탭)하면 중단
    source: text("source").default("local"), // 'local' | 'google'
    googleEventId: text("google_event_id"), // Google 캘린더 이벤트 연결(양방향 매핑)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("events_user_starts_idx").on(t.userId, t.startsAt),
    index("events_user_google_idx").on(t.userId, t.googleEventId),
  ],
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

// 주간 회고 편지 — 상담사가 한 주의 일기·기분·달성을 묶어 보내는 짧은 편지(아카이브).
export const letters = pgTable(
  "letters",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(), // 그 주 월요일
    weekEnd: date("week_end").notNull(), // 그 주 일요일
    personaName: text("persona_name"), // 보낸 상담사 캐릭터 이름(서명)
    body: text("body").notNull(), // 편지 본문(프로즈)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("letters_user_week_idx").on(t.userId, t.weekStart)],
);

// 비상 주머니 — 괜찮은 날의 내가 무너진 날의 나에게 미리 써두는 카드.
export const pocketCards = pgTable(
  "pocket_cards",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("pocket_user_idx").on(t.userId, t.createdAt)],
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
    // 의미 검색용 임베딩(text-embedding-3-small 등 1536차원). null이면 importance 폴백.
    embedding: vector("embedding", { dimensions: 1536 }),
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

// Google 캘린더 연동(사용자별 1계정). 토큰은 암호화 저장(lib/crypto).
export const googleAccounts = pgTable("google_accounts", {
  userId: bigint("user_id", { mode: "number" })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(), // enc:v1:
  accessToken: text("access_token"), // enc:v1: (캐시)
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  email: text("email"),
  calendarId: text("calendar_id").notNull().default("primary"),
  syncToken: text("sync_token"), // 증분 pull 용
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});

// 상담→비서 핸드오프 제안(동의 기반). 할 일 한 줄만 저장 — 대화 맥락/사유는 절대 저장 안 함.
export const handoffSuggestions = pgTable(
  "handoff_suggestions",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourcePersonaId: bigint("source_persona_id", { mode: "number" }).references(
      () => personas.id,
    ),
    suggestedText: text("suggested_text").notNull(), // "병원 예약" 같은 한 줄
    status: text("status").notNull().default("pending"), // pending|accepted|dismissed|expired
    createdEventId: bigint("created_event_id", { mode: "number" }).references(
      () => events.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("handoff_user_status_idx").on(t.userId, t.status)],
);
