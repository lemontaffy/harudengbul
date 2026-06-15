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
  real,
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
  // 일기 리마인드(선제 톡 재사용) — 기본 off, 21:30, 담당은 상담가 캐릭터
  diaryReminderEnabled: boolean("diary_reminder_enabled").default(false),
  diaryReminderTime: time("diary_reminder_time").default("21:30"),
  diaryReminderPersonaId: bigint("diary_reminder_persona_id", {
    mode: "number",
  }).references(() => personas.id, { onDelete: "set null" }),
  diaryReminderLastSent: date("diary_reminder_last_sent"), // 중복 방지
  diaryReminderNoWriteStreak: integer("diary_reminder_no_write_streak").default(0), // 무응답 연속 횟수(자동 후퇴)
  // 생성형 "한마디" 하루 1회 캐시
  dailyPhrase: text("daily_phrase"),
  dailyPhraseDate: date("daily_phrase_date"),
  // memoryJob 워터마크 — 여기까지 기억 추출 처리됨(이후 id만 새로 처리)
  memoryLastMsgId: bigint("memory_last_msg_id", { mode: "number" }).default(0),
  memoryLastDiaryId: bigint("memory_last_diary_id", { mode: "number" }).default(0),
  // 상담→비서 핸드오프 제안 기능 on/off(기본 on). off면 도구·프롬프트 모두 미주입.
  handoffEnabled: boolean("handoff_enabled").default(true),
  // 아이템 반응 대사 LLM 생성 빈도 — 'always'|'sometimes'|'never'. never면 기본 템플릿만(LLM 미호출).
  itemReactionFreq: text("item_reaction_freq").notNull().default("sometimes"),
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
  // 보조 모델 — 사진 캡션 등 배경 작업용 연결(대화엔 안 나섬). 연결 삭제 시 set null.
  auxConnectionId: bigint("aux_connection_id", { mode: "number" }).references(
    () => llmConnections.id,
    { onDelete: "set null" },
  ),
  // 편지 답장 전용 연결(저빈도·고품질). 기본값(null)이면 메인 연결 사용.
  letterConnectionId: bigint("letter_connection_id", { mode: "number" }).references(
    () => llmConnections.id,
    { onDelete: "set null" },
  ),
  lettersPerDay: integer("letters_per_day").notNull().default(1), // 1일 편지 발송 상한(비용 천장)
  // [레거시] 단일 연결 컬럼 — 다중 연결(llm_connections)로 이관됨. 폴백/하위호환용 유지.
  llmApiKey: text("llm_api_key"),
  llmBaseUrl: text("llm_base_url"),
  llmModel: text("llm_model"),
  llmEmbeddingModel: text("llm_embedding_model"),
  // 화면 — 프리셋 테마(lantern/dawn/paper) + 고급 커스텀 CSS(본인 세션에만 주입).
  theme: text("theme").default("lantern"),
  customCss: text("custom_css"),
  // 펫 성장 일일 상한(5pt) 추적 + 마지막 앱 활동(48h 잠 판정) + 홈 위젯용 마지막 본 방.
  growthDate: date("growth_date"),
  growthToday: integer("growth_today").default(0),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  petLastRoomId: bigint("pet_last_room_id", { mode: "number" }),
  // 홈 화면에서 숨긴 섹션 키 목록(null/빈 배열 = 전부 표시).
  hiddenHome: text("hidden_home").array(),
});

// CSS 테마 보관함 — 사용자가 이름 붙여 여러 개 저장해두고 골라 적용(적용본은 settings.custom_css).
export const cssThemes = pgTable(
  "css_themes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    css: text("css").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("css_themes_user_idx").on(t.userId, t.createdAt)],
);

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
    // 이미지 인식(비전) 지원 모델 여부 — 켜면 일기 사진을 읽어 답장/주간편지에 반영.
    // 자동감지 불가(OpenAI 호환 엔드포인트)라 사용자가 연결별로 지정. 기본 off(예: DeepSeek).
    supportsVision: boolean("supports_vision").notNull().default(false),
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
    // 복수 역할(순서 의미 있음 — 첫 원소가 주 역할). 최소 1개.
    // counselor 는 단독 전용(조합 불가) — lib/persona.validateRoles 강제.
    roles: text("roles").array().notNull(),
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
    // 첨부 이미지(v1: 메시지당 1장). caption = 비전 보조모델이 1회 생성한 텍스트 묘사.
    //   비전 미지원 연결로 전환해도 caption 으로 대화가 이어진다.
    attachmentPath: text("attachment_path"),
    attachmentCaption: text("attachment_caption"),
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
    photoPath: text("photo_path"), // 한 줄+사진 모드 — 사진 한 장만으로도 그날 일기 성립
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
    // '10분 뒤 다시'(스누즈) — 이 시각까지 반복 억제, 도래 시 1회 재푸시.
    alarmSnoozeUntil: timestamp("alarm_snooze_until", { withTimezone: true }),
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

// 타임캡슐 — 미래의 나에게 쓰는 편지. 봉인 후 도착일에 배달 캐릭터가 선제 톡으로 전달.
export const timeCapsules = pgTable(
  "time_capsules",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 배달 캐릭터. 삭제되면 NULL → 배달 시 비서 역할로 폴백.
    personaId: bigint("persona_id", { mode: "number" }).references(
      () => personas.id,
      { onDelete: "set null" },
    ),
    content: text("content").notNull(), // 편지 원문(배달 시 변형 금지)
    deliverOn: date("deliver_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("time_capsules_user_idx").on(t.userId),
    index("time_capsules_due_idx").on(t.deliverOn, t.deliveredAt),
  ],
);

// 스누즈 1회용 토큰 소비 기록 — 같은 토큰 재사용 거부용(서비스워커는 세션이 없어 서명 토큰으로 인증).
export const snoozeTokens = pgTable("snooze_tokens", {
  jti: text("jti").primaryKey(),
  usedAt: timestamp("used_at", { withTimezone: true }).defaultNow(),
});

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
    source: text("source"), // 'chat' | 'diary' | 'pet_letter' 등(출처 종류)
    importance: integer("importance").default(3), // 1~5
    // 영역 스코프 — 회수 격리용. 'legacy'(기존, 소급분류 안 함) | 'pet'(펫과 쌓은 추억) |
    //   'secretary'/'counselor'/... (페르소나 역할). 펫 LLM 은 scope='pet'만, 페르소나는 scope<>'pet'만 본다.
    scope: text("scope").notNull().default("legacy"),
    // scope='pet' 일 때 어느 펫의 추억인지(펫별 한정 회수). 펫 삭제 시 SET NULL(추억 보존하되 회수 대상에서 빠짐).
    petId: bigint("pet_id", { mode: "number" }).references(() => pets.id, { onDelete: "set null" }),
    // 의미 검색용 임베딩(text-embedding-3-small 등 1536차원). null이면 importance 폴백.
    embedding: vector("embedding", { dimensions: 1536 }),
    lastReferenced: timestamp("last_referenced", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("memories_user_idx").on(t.userId, t.importance, t.createdAt),
    index("memories_user_scope_idx").on(t.userId, t.scope, t.petId),
  ],
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
    // 메모 승격으로 생긴 핸드오프면 원본 메모 id — 승인(일정 등록) 시 그 메모 자동 체크.
    sourceMemoId: bigint("source_memo_id", { mode: "number" }).references(
      () => memos.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("handoff_user_status_idx").on(t.userId, t.status)],
);

// 업적판 — 사용자가 '해낸 일'. 상담 맥락/사유는 절대 저장 안 함(추출 텍스트 한 줄만).
export const achievements = pgTable(
  "achievements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(), // 해낸 일 한 줄
    sourcePersonaId: bigint("source_persona_id", { mode: "number" }).references(() => personas.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("achievements_user_idx").on(t.userId, t.createdAt)],
);

// 상담→업적판 핸드오프 제안(동의 기반). 핸드오프와 동형 — 해낸 일 한 줄만, 맥락 비전이.
export const achievementSuggestions = pgTable(
  "achievement_suggestions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourcePersonaId: bigint("source_persona_id", { mode: "number" }).references(() => personas.id),
    suggestedText: text("suggested_text").notNull(), // "며칠 만에 일어나 밥을 챙겨 먹음" 같은 한 줄
    status: text("status").notNull().default("pending"), // pending|accepted|dismissed|expired
    createdAchievementId: bigint("created_achievement_id", { mode: "number" }).references(
      () => achievements.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("achievement_sugg_user_status_idx").on(t.userId, t.status)],
);

// 만능 캡처 인박스 — 떠오른 모든 것을 1초 안에. 분류·마감·우선순위 없음(마찰 제로).
export const memos = pgTable(
  "memos",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("memos_user_done_idx").on(t.userId, t.done, t.createdAt)],
);

// ── 펫 룸 v1 ──────────────────────────────────────────────
// 후퇴 없는 펫. 게이지·시듦 없음, 상태는 깨어있음/잠 둘뿐. 관계는 사용자 선언 설정.

export const petRooms = pgTable("pet_rooms", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // [deprecated] v1.5에서 room_backgrounds(스트립)로 이행. 읽기/쓰기 안 함(데이터만 보존).
  backgroundPath: text("background_path"),
  pixelRenderBg: boolean("pixel_render_bg").notNull().default(true),
  // 방 전역 분주함(0~100, 기본 50). 실효 활동성 = pets.activeness × (liveliness/50). 0이면 정지.
  liveliness: integer("liveliness").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pets = pgTable(
  "pets",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 펫은 전역(user 단위). room_id 는 "어느 방에 있을지" 참조(종속 아님). null = 대기(어느 방에도 없음).
    // 방 삭제 시 FK SET NULL 로 펫 보존(room_id 만 null). pos_x/y 는 방에 있을 때만 의미.
    roomId: bigint("room_id", { mode: "number" }).references(() => petRooms.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    personality: text("personality"),
    posX: real("pos_x").notNull().default(50), // % (0~100)
    posY: real("pos_y").notNull().default(70),
    pixelRender: boolean("pixel_render").notNull().default(true),
    growthPoints: integer("growth_points").notNull().default(0),
    teenThreshold: integer("teen_threshold").notNull().default(30),
    adultThreshold: integer("adult_threshold").notNull().default(90),
    lastStageSeen: text("last_stage_seen"), // 진화 1회 연출 추적
    // v1.5: 살아있는 방.
    talkativeness: integer("talkativeness").notNull().default(30), // 0~100, 자발 발화 빈도
    activeness: integer("activeness").notNull().default(30), // 0~100, 펫별 기질(배회·핑퐁 빈도)
    displayStage: text("display_stage"), // null=실제 성장 스테이지, 값=그 모습으로 고정(렌더만)
    walkFacing: text("walk_facing").notNull().default("left"), // walk GIF 기본 진행 방향
    sitFacing: text("sit_facing").notNull().default("left"), // sit 스프라이트가 바라보는 방향(가구 facing 정렬용)
    locomotion: text("locomotion").notNull().default("ground"), // 'ground'(바닥 구역) | 'air'(비행, 부엉이류)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("pets_user_room_idx").on(t.userId, t.roomId)],
);

// 확장 맵 — 방의 배경 패널들(가로 스트립). 기존 pet_rooms.background_path 는 패널 0으로 이행.
export const roomBackgrounds = pgTable(
  "room_backgrounds",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    roomId: bigint("room_id", { mode: "number" })
      .notNull()
      .references(() => petRooms.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    pixelRender: boolean("pixel_render").notNull().default(true),
    // 바닥 구역(%, ground 펫이 다닐 수 있는 위·아래 경계). 배경마다 바닥 높이가 달라 패널별로 가짐.
    floorTopY: real("floor_top_y").notNull().default(72),
    floorBottomY: real("floor_bottom_y").notNull().default(92),
  },
  (t) => [index("room_bg_room_idx").on(t.roomId, t.sortOrder)],
);

// 가구 — 방에 배치하는 오브젝트. seat(펫이 앉음) / fixture(탭하면 앱 기능 입구).
export const roomFurniture = pgTable(
  "room_furniture",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    roomId: bigint("room_id", { mode: "number" })
      .notNull()
      .references(() => petRooms.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'seat' | 'fixture'
    type: text("type").notNull().default("furniture"), // 라벨: 'bench'|'cushion'|'mailbox' 등
    spritePath: text("sprite_path").notNull(),
    spriteAltPath: text("sprite_alt_path"), // 상태 'active'(예: 안 읽은 편지)일 때 스프라이트(우체통 열림)
    posX: real("pos_x").notNull().default(50),
    posY: real("pos_y").notNull().default(50),
    pixelRender: boolean("pixel_render").notNull().default(true),
    // seat 전용: 앉은 펫이 바라볼 방향 + 좌석면 높이(가구 박스 0=위 ~ 100=아래, 펫 엉덩이 기준선).
    facing: text("facing").notNull().default("left"),
    seatY: real("seat_y").notNull().default(40),
    // 배치 후 수동조정 — 크기 배율(0.3~3) · 회전(도, -180~180).
    scale: real("scale").notNull().default(1),
    rotation: real("rotation").notNull().default(0),
    // fixture가 여는 앱 기능(액션 타입): 'letters'|'memo'|'diary'|'none'. seat은 null.
    // (스펙의 'function'을 JS 예약어 회피 위해 action_type 컬럼으로.)
    actionType: text("action_type"),
  },
  (t) => [index("room_furniture_room_idx").on(t.roomId)],
);

// 펫 편지 — 사용자가 펫에게 쓰는 편지(하루 1통). to_pet_id null = 전원에게.
// ※ 기존 `letters`(주간 상담 편지)와 별개 — 이름 충돌 회피로 pet_letters.
export const petLetters = pgTable(
  "pet_letters",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toPetId: bigint("to_pet_id", { mode: "number" }).references(() => pets.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("pet_letters_user_sent_idx").on(t.userId, t.sentAt)],
);

// 펫 답장 — 받는 펫별 단발 생성(딜레이 후 도착). status pending→arrived, read_at 으로 읽음 추적.
export const petLetterReplies = pgTable(
  "pet_letter_replies",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    letterId: bigint("letter_id", { mode: "number" })
      .notNull()
      .references(() => petLetters.id, { onDelete: "cascade" }),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("pending"), // 'pending' | 'arrived'
    deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("pet_letter_replies_due_idx").on(t.status, t.deliverAt)],
);

// 펫 일기 — 펫이 '안 볼 때' 쓴 것 같은 짧은 일기. 하루 1회 5인분 생성·고정(읽기 전용).
// ※ 사용자 작성 일기(diary 테이블)와 완전 별개 — 절대 안 섞임.
export const petDiaries = pgTable(
  "pet_diaries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD(사용자 tz 자정 기준)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("pet_diaries_user_pet_date_idx").on(t.userId, t.petId, t.date), // 1일 1펫 1편(중복 생성 방지)
    index("pet_diaries_user_date_idx").on(t.userId, t.date),
  ],
);

// 커스텀 모션 스프라이트 — 스테이지별, 빈도 가중 자동/수동 재생. 수치·상태와 무관.
export const petCustomSprites = pgTable(
  "pet_custom_sprites",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(), // 'baby'|'teen'|'adult' — 표시 스테이지 일치 시만
    name: text("name").notNull(),
    path: text("path").notNull(),
    frequency: text("frequency").notNull().default("sometimes"), // 'often'|'sometimes'|'manual'
    line: text("line"), // 재생 시 함께 표시할 대사 한 줄(선택)
  },
  (t) => [index("pet_custom_pet_idx").on(t.petId, t.stage)],
);

export const petSprites = pgTable(
  "pet_sprites",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(), // 'baby' | 'teen' | 'adult'
    kind: text("kind").notNull(), // 'idle' | 'sleep' | 'walk' | 'love'
    path: text("path").notNull(),
  },
  (t) => [uniqueIndex("pet_sprites_slot_idx").on(t.petId, t.stage, t.kind)],
);

export const petRelations = pgTable(
  "pet_relations",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // a < b 정규화. 방 경계 무관(사용자 전역).
    petAId: bigint("pet_a_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    petBId: bigint("pet_b_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    relationLabel: text("relation_label").notNull(), // 자유 텍스트(연인/라이벌/혐관 등)
  },
  (t) => [uniqueIndex("pet_relations_pair_idx").on(t.userId, t.petAId, t.petBId)],
);

export const petLines = pgTable(
  "pet_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    kind: text("kind").notNull(), // 'solo' | 'about_other' | 'wake'
    aboutPetId: bigint("about_pet_id", { mode: "number" }).references(() => pets.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    source: text("source").notNull().default("auto"), // 'auto'(재생성 교체 대상) | 'manual'(보존)
  },
  (t) => [index("pet_lines_pet_stage_idx").on(t.petId, t.stage)],
);

// 아이템 — 방에 두거나 특정 펫에게 준 오브젝트. 내구도는 게임 시스템이 아니라 '개그 타이머'
// (안 볼 때 안 닳음·수리 무료). durability_max null = 무한(안 깨짐). durability_now 0 = 파손(금 간 상태로 남음).
export const petItems = pgTable(
  "pet_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: bigint("room_id", { mode: "number" }).references(() => petRooms.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    spritePath: text("sprite_path").notNull(),
    brokenSpritePath: text("broken_sprite_path"), // 파손(durability 0) 시 모습. null이면 CSS 금 오버레이로 폴백.
    pixelRender: boolean("pixel_render").notNull().default(true),
    posX: real("pos_x").notNull().default(50),
    posY: real("pos_y").notNull().default(70),
    durabilityMax: integer("durability_max"), // null = 무한(마모·파손 없음)
    durabilityNow: integer("durability_now").notNull().default(0),
    heldByPetId: bigint("held_by_pet_id", { mode: "number" }).references(() => pets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("pet_items_user_room_idx").on(t.userId, t.roomId)],
);

// 캐싱된 아이템 반응 대사 풀 — (이 펫 × 이 아이템 × kind) 조합당 1회 생성 후 저장, 이후 풀에서 랜덤(재호출 X).
export const itemReactions = pgTable(
  "item_reactions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => petItems.id, { onDelete: "cascade" }),
    petId: bigint("pet_id", { mode: "number" })
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'receive' | 'break' | 'idle'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("item_reactions_item_pet_kind_idx").on(t.itemId, t.petId, t.kind)],
);

// 전역 아이템/가구 라이브러리(계정 단위) — 방마다 흩어 올리는 대신 한 곳에서 관리.
//   기존 room_furniture(인스턴스/방) + pet_items 를 통합. kind 로 가구/아이템 구분.
//   가구는 furniture_placements 로 여러 방에 배치(인스턴스), 아이템은 방 배치 없이 펫에 지급(owner).
export const items = pgTable(
  "items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // 'furniture' | 'item'
    spritePath: text("sprite_path").notNull(),
    ownerPetId: bigint("owner_pet_id", { mode: "number" }).references(() => pets.id, {
      onDelete: "set null",
    }), // 예: 도미닉의 찻잔(소유 펫)
    pixelRender: boolean("pixel_render").notNull().default(true),
    // 가구 속성(kind='furniture')
    furnitureKind: text("furniture_kind"), // 'seat' | 'fixture'
    type: text("type"), // 라벨('bench' 등)
    spriteAltPath: text("sprite_alt_path"), // active 상태(우체통 열림 등)
    actionType: text("action_type"), // fixture: 'letters'|'memo'|'diary'|'pet_diary'|'achievements'|'none'
    facing: text("facing").notNull().default("left"), // seat 방향
    seatY: real("seat_y").notNull().default(40), // seat 좌석면(%)
    // 아이템 속성(kind='item')
    brokenSpritePath: text("broken_sprite_path"),
    durabilityMax: integer("durability_max"), // null = 무한
    durabilityNow: integer("durability_now").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("items_user_kind_idx").on(t.userId, t.kind)],
);

// 가구 배치 인스턴스 — 같은 가구(items)를 여러 방에 둘 수 있음. 위치·z·크기·회전은 배치별.
export const furniturePlacements = pgTable(
  "furniture_placements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    roomId: bigint("room_id", { mode: "number" })
      .notNull()
      .references(() => petRooms.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    posX: real("pos_x").notNull().default(50),
    posY: real("pos_y").notNull().default(50),
    zOrder: integer("z_order").notNull().default(0),
    scale: real("scale").notNull().default(1),
    rotation: real("rotation").notNull().default(0),
  },
  (t) => [index("furniture_placements_room_idx").on(t.roomId)],
);
