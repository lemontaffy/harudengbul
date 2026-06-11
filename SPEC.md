# 하루등불 (가칭) — AI 비서·상담 동반자 앱 기술 스펙 (Hetzner 셀프호스트판)

> 이 문서는 Claude Code에 투입하는 단일 진실 소스(SSOT)다. 레포 루트에 SPEC.md로 둔다.
> v2: Supabase 제거. 개인 Hetzner 서버(CPX32, 4vCPU/8GB) 셀프호스트 + 단일 사용자 전제로 단순화.

## 0. 한 줄 정의

데스크탑·모바일에서 동기화되는 1인용 AI 비서/상담 앱.
페르소나 2인(남/여, 전환 가능)이 카톡처럼 대화하고, 일정·날씨를 챙기고,
하루 일기에 답장하고, 가계부와 장기기억을 가진다.

## 1. 스택 (결정 사항)

| 영역 | 선택 | 근거 |
|---|---|---|
| 프론트+백 | Next.js 15 (App Router, standalone) + TypeScript + Tailwind | Route Handlers가 곧 백엔드. 별도 API 서버 불필요 |
| PWA | Serwist | 서비스워커·오프라인·푸시 수신 |
| DB | Postgres 16 (Docker) + Drizzle ORM | 1인용이지만 pgvector(Phase 3)와 가계부 집계 때문에 Postgres 확정 |
| 크론/잡 | 전용 worker 프로세스 (node-cron) | 선제 톡·알람·날씨 캐시·기억 추출. Next 프로세스와 분리해 중복 실행 방지 |
| AI | OpenRouter (서버 env에 키, Route Handler에서 직접 호출) | 프록시 계층 불필요 — 서버가 곧 백엔드 |
| 리버스 프록시 | Caddy | 자동 HTTPS. PWA/푸시/TWA 전부 HTTPS 필수 |
| 컨테이너 | docker-compose (app / worker / db / caddy) | 기존 SillyTavern과 동거 |
| APK | Bubblewrap (TWA) | 같은 코드로 안드로이드 설치판 |
| 날씨 | 기상청 단기예보 API (data.go.kr) | 한국 정확도. 폴백: OpenWeatherMap |

**전제 조건 (코드 밖 준비물)**
- 도메인 1개 필수 (TWA assetlinks + HTTPS 때문에 IP로는 불가). 예: `haru.example.com`.
  기존 SillyTavern도 Caddy 뒤로 옮겨 서브도메인 분리 권장 (`st.example.com`).
- 시크릿: `OPENROUTER_API_KEY`, `KMA_API_KEY`(data.go.kr 승인 대기 있음 — 미리 신청),
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`(`npx web-push generate-vapid-keys`),
  `APP_PASSWORD`(로그인용), `SESSION_SECRET`.

## 2. 단일 사용자 단순화 원칙

- 멀티테넌트 없음: 모든 테이블에서 user_id 제거. `settings`는 id=1 단일 행.
- 인증: 비밀번호 1개(`APP_PASSWORD`, argon2 해시 비교) + httpOnly 세션 쿠키(iron-session).
  로그인 화면 하나, 가입/복구 플로우 없음. 모든 라우트는 미들웨어에서 세션 검사.
- RLS·정책 없음. DB는 docker 내부 네트워크에서만 접근 (호스트 포트 비공개).

## 3. 페르소나

### 3.1 정의
- **테오 (Theo)** — 남성. 차분, 건조한 유머, 비서 성향. 브리핑이 간결.
- **노라 (Nora)** — 여성. 다정하지만 단호, 상담 성향. 질문을 잘 던짐.
- 언제든 전환 가능. 대화 스레드는 페르소나별 분리 보관.
- 아바타: 사용자 업로드 이미지(NAI 생성 프사). 서버 볼륨 `/data/avatars`에 저장.

### 3.2 시스템 프롬프트 템플릿

```
너는 {name}({name_en}), 사용자의 비서 겸 상담 동반자다.

[말투 규칙 — 절대 위반 금지]
- 메신저(카카오톡) 답장처럼 말한다. 1~5문장, 짧은 문단.
- 행동묘사·지문 금지: *웃으며*, (고개를 끄덕인다) 류의 표현 절대 사용 불가.
- 소설체·나레이션 금지. 오직 대사만.
- 이모지는 한 메시지에 최대 1개, 없어도 됨.
- 존댓말/반말은 사용자의 마지막 말투를 따라간다.

[성격]
{persona_traits}
# 테오: 차분하고 군더더기 없다. 가끔 건조한 농담. 걱정은 짧고 정확하게 표현.
# 노라: 따뜻하지만 물러서지 않는다. 좋은 질문을 하나씩 던진다. 호들갑 금지.

[비서 역할]
- 오늘 일정({events})과 날씨({weather})를 자연스럽게 챙긴다.
- 비/눈 예보가 있으면 우산·옷차림을 먼저 언급한다.
- 일정 추가/수정 요청을 인식하면 도구 호출(섹션 7)로 처리한다.

[상담 역할]
- 진단하지 않는다. 병명을 먼저 꺼내지 않는다.
- 자책이 과할 때: "친한 친구가 같은 일을 했다면 뭐라고 말해줄 것 같아?" 관점을 활용.
- 행동의 크기와 죄책감의 크기의 비례를 다룬다. 잘못 자체를 부정하지는 않는다.
- 사용자의 종교적 신념을 존중하고 반박하지 않는다.
- 무거움이 며칠 이어지는 패턴이 보이면 전문 상담을 부드럽게 권한다. 강요 금지.
- 해로운 대처(과음 등) 언급 시 정죄 없이 안전한 대안을 권한다.

[기억]
다음은 과거 대화·일기에서 추출된 장기기억이다. 자연스럽게 활용하되 출처를 들먹이지 않는다:
{memories}

[현재 컨텍스트]
날짜/시간: {now} / 위치: {location}
날씨: {weather_summary}
오늘 일정: {today_events}
최근 기분 기록: {recent_moods}
```

### 3.3 선제 톡(proactive) 생성 프롬프트
worker가 트리거할 때 위 시스템 프롬프트 + 아래 지시로 1회 생성:
```
지금은 {trigger_type} 시간이다. 사용자가 앱을 열지 않은 상태에서 네가 먼저 보내는 한 통의 메시지를 작성하라.
- morning_briefing: 오늘 날씨/일정 브리핑 + 가벼운 안부. 비/눈이면 우산 먼저.
- evening_checkin: 오늘 하루 어땠는지 묻기. 일기 쓰기를 가볍게 권유.
- 2~4문장. 답장을 강요하는 말투 금지.
```

## 4. DB 스키마 (Postgres / Drizzle)

```sql
create table settings (
  id int primary key default 1 check (id = 1),
  active_persona text not null default 'nora',        -- 'theo' | 'nora'
  proactive_enabled boolean default false,
  morning_time time default '08:00',
  evening_time time default '22:00',
  location_lat numeric, location_lon numeric,
  kma_nx int, kma_ny int,                              -- 기상청 격자좌표
  timezone text default 'Asia/Seoul'
);

create table personas (
  id text primary key,                                 -- 'theo' | 'nora'
  display_name text, avatar_path text,
  custom_traits text                                   -- 사용자가 추가한 설정
);

create table messages (
  id bigint generated always as identity primary key,
  persona text not null,
  role text not null check (role in ('user','assistant','proactive')),
  content text not null,
  created_at timestamptz default now()
);

create table diary_entries (
  id bigint generated always as identity primary key,
  entry_date date unique not null,
  mood text,                                           -- storm|rain|cloud|haze|sun
  body text,
  ai_reply text, ai_persona text,
  created_at timestamptz default now()
);

create table diary_items (
  id bigint generated always as identity primary key,
  entry_id bigint references diary_entries on delete cascade,
  label text not null,                                 -- 예: "운동", "그림 작업"
  amount text,                                         -- 예: "30분", "3장"
  weight int check (weight between 1 and 5)            -- 체감 분량 1~5
);

create table events (
  id bigint generated always as identity primary key,
  title text not null,
  starts_at timestamptz not null, ends_at timestamptz,
  alarm_minutes_before int,
  alarm_sent boolean default false,
  source text default 'local',                         -- 'local' | 'google' (3단계)
  created_at timestamptz default now()
);

create table transactions (
  id bigint generated always as identity primary key,
  tx_date date not null,
  kind text not null check (kind in ('expense','income')),
  category text not null,
  amount int not null,                                 -- KRW 정수
  memo text,
  created_at timestamptz default now()
);

create table memories (
  id bigint generated always as identity primary key,
  content text not null,
  source text,                                         -- 'chat' | 'diary'
  importance int default 3 check (importance between 1 and 5),
  last_referenced timestamptz,
  created_at timestamptz default now()
);
-- v2: pgvector 임베딩 컬럼 추가 예정. v1은 importance desc, created_at desc 상위 20개 주입.

create table push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text unique not null,
  keys jsonb not null,
  created_at timestamptz default now()
);

create table weather_cache (
  id int primary key default 1 check (id = 1),
  fetched_at timestamptz,
  payload jsonb,                                       -- 파싱된 예보
  has_rain boolean default false, has_snow boolean default false
);
```

## 5. 서버 구성 (docker-compose)

```yaml
services:
  caddy:    # :80/:443. haru.example.com → app:3000, st.example.com → sillytavern
  app:      # Next.js standalone. env: DB_URL, OPENROUTER_API_KEY, VAPID_*, APP_PASSWORD, SESSION_SECRET
  worker:   # node worker/index.ts — node-cron 잡들. app과 같은 코드베이스, 다른 엔트리포인트
  db:       # postgres:16, 볼륨 ./data/pg, 포트 외부 비공개
```

### worker 잡 목록 (Edge Functions 대체)
| 잡 | 주기 | 역할 |
|---|---|---|
| `proactiveJob` | 매 5분 | settings의 morning/evening 시간 도달 + proactive_enabled면 선제 톡 생성 → messages(role='proactive') 저장 + 웹푸시. 같은 슬롯 중복 발송 방지용 마지막 발송 시각 기록 |
| `alarmJob` | 매 1분 | `starts_at - alarm_minutes_before` 도달 & !alarm_sent 인 events에 푸시 → alarm_sent=true |
| `weatherJob` | 매 1시간 | 기상청 단기예보 → weather_cache 갱신, 비/눈 플래그 |
| `memoryJob` | 매 30분 | 미처리 대화 20턴↑ 또는 새 일기 → OpenRouter로 기억 후보 추출 → memories upsert |
| `backupJob` | 매일 04:00 | `pg_dump` → /data/backups (7일 로테이션). Hetzner 콘솔 백업과 별개로 유지 |

### API 라우트 (Next.js Route Handlers)
- `POST /api/chat` — SSE 스트리밍. 페르소나 + 기억 + 컨텍스트 조립 → OpenRouter
- `POST /api/diary` — 저장 후 비동기로 답장 생성(ai_reply) + 푸시
- `GET/POST /api/events`, `/api/transactions`, `/api/settings`, `/api/push/subscribe`
- `POST /api/login` — APP_PASSWORD 검증 → 세션 쿠키

## 6. 푸시

- Web Push (VAPID) + Serwist 서비스워커 `push` 핸들러.
- 발송은 app/worker에서 `web-push` 라이브러리로 직접.
- Android(TWA): 네이티브 수준 동작. iOS: 홈 화면 설치 시(16.4+)만 — 한계 명시.

## 7. 채팅 도구 호출 (OpenRouter tool-use)

- `add_event(title, starts_at, alarm_minutes_before?)`
- `add_transaction(kind, category, amount, memo?)`
- `save_memory(content, importance)`
실행 결과는 메시지로 자연스럽게 확인 ("내일 15:00 회의 넣어놨어. 30분 전에 알려줄게.").

## 8. 화면 구성

1. **홈(채팅)** — 활성 페르소나와 대화. 상단 아바타+이름, 탭으로 페르소나 전환.
   선제 톡은 일반 말풍선과 동일하게 흘러들어옴.
2. **오늘** — 날씨 카드(비/눈 배지) + 오늘 일정 + 기분 체크인(5단계) + "오늘 한 일" 항목(라벨/분량/체감 1~5).
3. **일기** — 하루 1편. 저장 시 활성 페르소나가 답장(푸시). 달력 뷰, 기분 색 점.
4. **가계부** — 빠른 입력, 월별 합계·카테고리 도넛, 최근 내역.
5. **설정** — 페르소나 관리(아바타 업로드·custom_traits), 선제 톡 on/off·시간, 위치, 알림 권한, 데이터 내보내기(json), 로그아웃.

디자인: 다크 기본, 메신저 톤. 팔레트: bg #191B25, surface #222531, accent #E8A86B.

## 9. 단계별 로드맵

### Phase 1 — MVP
- docker-compose 골격 (caddy/app/worker/db) + Caddy HTTPS + 도메인 연결
- Drizzle 스키마 + 마이그레이션
- 로그인(비밀번호+세션) + 미들웨어
- 채팅 (SSE, 페르소나 전환, 말투 규칙)
- 일기 작성 + AI 답장
- 오늘 화면 (기분 체크인 + diary_items)
- 일정 CRUD (알람은 Phase 2)
- PWA 설치 (manifest + Serwist)

### Phase 2 — 살아있는 비서
- 웹푸시 파이프라인 + alarmJob
- proactiveJob 선제 톡 (중복 발송 방지 포함)
- weatherJob + 브리핑/우산 멘트
- memoryJob 장기기억 파이프라인
- 채팅 도구 호출
- backupJob

### Phase 3 — 확장
- 가계부 전체 화면 + 채팅 입력("점심 9천원" → add_transaction)
- Bubblewrap TWA → APK (assetlinks.json은 Caddy가 서빙)
- Google Calendar OAuth 양방향 동기화
- memories pgvector 전환 (postgres 이미지에 pgvector 확장)

## 10. Claude Code 운용 팁

- 이 파일을 레포 루트 SPEC.md로 두고 CLAUDE.md에 "SPEC.md가 SSOT" 명시.
- Phase 단위 지시: "SPEC.md의 Phase 1 구현. 완료 기준: 도메인 HTTPS 접속 → 로그인 → 채팅 → 일기 답장 동작."
- 배포 루프: 로컬에서 `docker compose up` 검증 → 서버에 git pull + `docker compose up -d --build`.
- 기존 SillyTavern 포트와 충돌 확인: Caddy로 일원화하면서 ST의 직접 노출 포트는 닫는 것 권장.
- 시크릿 체크리스트: OPENROUTER_API_KEY, KMA_API_KEY, VAPID_PUBLIC/PRIVATE, APP_PASSWORD, SESSION_SECRET.