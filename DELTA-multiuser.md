# DELTA: 단일 사용자 → 초대제 멀티유저 전환

> SPEC.md의 부록. 충돌 시 이 문서가 우선한다.
> 목표: 운영자(나) + 초대받은 지인 소수. 공개 가입 없음. 이메일 인증/SMTP 없음 — 초대 코드가 곧 인증이다.

## 0. 전환 원칙

- 기존 데이터는 전부 운영자 계정으로 귀속(backfill)한다.
- 마이그레이션 전 수동 백업 필수: `docker compose exec db pg_dump -U postgres haru > pre_multiuser.sql`
- 사용자 간 데이터는 완전 격리: 모든 조회·기억 주입·푸시가 세션의 user_id로 스코프된다.

## 1. 스키마 변경

```sql
create table users (
  id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null,             -- argon2
  role text not null default 'member' check (role in ('admin','member')),
  is_active boolean default true,          -- 비활성화 = 즉시 차단
  created_at timestamptz default now()
);

create table invites (
  code text primary key,                   -- 충분히 긴 랜덤 (예: 24자)
  created_by bigint references users,
  used_by bigint references users,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- user_id 추가 대상 (전부 not null, references users, 인덱스 생성):
--   settings        : id=1 단일행 제약 제거 → user_id primary key로 전환
--   personas        : pk를 (user_id, id)로. 아바타·custom_traits는 사용자별
--   messages, diary_entries, events, transactions, memories, push_subscriptions
--   diary_entries   : unique(entry_date) → unique(user_id, entry_date)

-- weather_cache    : 사용자별이 아니라 격자별 공유 캐시로 전환
--   pk (kma_nx, kma_ny), 같은 격자의 사용자들이 공유

-- 사용량 보호 (지인이 내 OpenRouter 크레딧 태우는 사고 방지):
create table usage_log (
  id bigint generated always as identity primary key,
  user_id bigint references users,
  kind text not null,                      -- 'chat' | 'diary_reply' | 'proactive' | 'memory'
  tokens_in int default 0, tokens_out int default 0,
  created_at timestamptz default now()
);
-- settings에 daily_message_limit int default 200 추가. 초과 시 채팅만 차단(일기 저장은 허용).

-- backfill 마이그레이션:
-- 1) admin 사용자 1명 생성 (기존 APP_PASSWORD를 초기 비밀번호로)
-- 2) 모든 기존 행의 user_id = admin.id
-- 3) not null 제약 활성화
```

## 2. 인증 변경

- `APP_PASSWORD` env 제거 → users 테이블 + argon2 검증.
- 세션 페이로드: { userId, role }. 미들웨어에서 is_active 확인 (비활성 사용자는 세션 즉시 무효).
- 가입 플로우: `/signup?code=...` — 코드 유효성(미사용 + 미만료) 확인 → username/비밀번호 설정 → invites.used_by 기록. 이메일 입력 없음.

## 3. 어드민 화면 (role='admin' 전용, 설정 탭에 추가)

- 초대 코드 발급 (만료 기본 7일) / 미사용 코드 취소
- 사용자 목록: 마지막 활동, 오늘 사용량(usage_log 집계), 활성/비활성 토글
- 비활성화는 소프트 삭제 — 데이터는 보존, 접근만 차단

## 4. 워커 잡 변경 (핵심 — 전부 사용자 루프로)

- `proactiveJob`: settings를 사용자별로 순회. 각자의 morning/evening 시간·timezone·proactive_enabled 기준. 중복 발송 방지 기록도 user_id별.
- `alarmJob`: events에 user_id 조인 → 해당 사용자의 push_subscriptions로만 발송.
- `weatherJob`: distinct (kma_nx, kma_ny) 격자만 순회 → weather_cache upsert. 사용자 수와 무관하게 API 호출 최소화.
- `memoryJob`: 사용자별 미처리분 순회. 추출된 기억은 해당 user_id로만 저장.
- `backupJob`: 변경 없음 (전체 DB 덤프).

## 5. 프롬프트 격리 (보안상 중요)

- 시스템 프롬프트의 {memories}, {recent_moods}, {today_events}는 반드시 세션 user_id 것만 주입.
- 페르소나 custom_traits도 사용자별 — A가 설정한 테오 성격이 B에게 보이면 안 됨.
- 교차 검증 테스트 1개 필수: 사용자 2명 생성 → A의 기억이 B의 채팅 프롬프트에 절대 포함되지 않음을 확인하는 통합 테스트.

## 6. 데이터 접근 계층 규칙

- 모든 쿼리는 repo 계층 함수로만 — 함수 시그니처 첫 인자를 userId로 강제.
- 라우트 핸들러에서 직접 db 호출 금지 (스코프 누락 사고의 주범).
- 점검: `grep`으로 라우트 내 직접 쿼리 호출이 0건인지 확인.

## 7. 작업 순서 (이 순서대로만)

1. pg_dump 수동 백업
2. 스키마 마이그레이션 + backfill (별도 브랜치)
3. 인증 교체 + 미들웨어
4. repo 계층에 userId 스코프 주입 (컴파일 에러를 가이드 삼아 전수 수정)
5. 워커 잡 사용자 루프 전환
6. 어드민 화면 + 초대 플로우
7. 5장의 교차 격리 테스트 통과 후 main 머지