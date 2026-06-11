# 하루등불 (CLAUDE.md)

**`SPEC.md`가 단일 진실 소스(SSOT)다.** 모든 구현 결정은 SPEC.md를 따른다.
이 파일은 SPEC에 안 적힌 *코드 밖 인프라 사실*과 SPEC에서 의도적으로 벗어난 결정만 기록한다.

## 인프라 (Hetzner + Cloudflare Tunnel)

- 서버: Hetzner CPX32 (4vCPU/8GB), Ubuntu. 호스트명 `daltavern`.
- 배포: `docker compose` — 서비스는 `app / worker / db` 3개.
- **Caddy 미사용 (SPEC 1·5장에서 벗어남).** 노출은 host의 systemd `cloudflared`(Cloudflare Tunnel `daltavern-tunnel`)가 담당.
  Cloudflare 엣지가 HTTPS·서브도메인 라우팅을 처리하므로 Caddy의 역할이 중복 → 제거.
- 공개 경로: `haru.daltavern.org` → tunnel → `http://localhost:3000`.
  - app 컨테이너는 `127.0.0.1:3000`에만 바인딩(인터넷 직접 노출 없음, 터널만 접근).
  - 터널은 dashboard 관리형 — Zero Trust 콘솔에서 Public Hostname 추가 시 DNS(CNAME) 자동 생성. 수동 A레코드 불필요.
- 기존 동거 앱 `marinara`: `samchi.daltavern.org` → `localhost:7861` (같은 터널). **손대지 않음.**
- Postgres: host에 포트 비공개. docker 내부망에서 `db:5432`로만 접근. 볼륨 `./data/pg`.
- 80/443: 비어 있음(터널이 inbound 포트를 안 씀).

## 운영 모드 (DELTA-multiuser)

- **초대제 멀티유저** — `DELTA-multiuser.md`가 SPEC §2(단일 사용자)를 대체. 충돌 시 DELTA 우선.
- 첫 관리자: 사용자 0명일 때 시드가 `ADMIN_USERNAME`(기본 admin) + `APP_PASSWORD_HASH`로 admin 1명 생성.
- 가입: 공개 가입 없음. admin이 `/admin`에서 초대 코드 발급 → `/signup?code=...` (이메일/SMTP 없음).
- **AI 연결은 사용자별** — `settings.llm_api_key/llm_base_url/llm_model` (OpenAI 호환). 공급사는 Base URL로 구분(OpenRouter/DeepSeek/OpenAI/Custom). 전역 공유·env 요청폴백 없음. 각자 자기 키.
- 데이터 접근은 `src/db/repo/*`의 userId-스코프 함수로만. 라우트에서 db 직접 호출 금지.

## 모델

- 채팅 연결(키/BaseURL/모델)은 사용자별 `settings`에서만 읽는다(`lib/config.ts#getLlmConfig`). **코드에 모델명/공급사 하드코딩 금지.**
- env `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL`는 선택 — 첫 admin 본인 연결 시드용일 뿐 전역 폴백 아님.

## 단계

- 현재 Phase 1 (MVP). 로드맵은 SPEC 9장. Phase 1 완료 기준:
  `haru.daltavern.org` HTTPS → 로그인 → 채팅 → 일기 답장 동작.
- worker의 실제 잡(proactive/alarm/weather/memory/backup)과 웹푸시는 Phase 2.

## 명령

- 개발: `npm run dev`
- 배포: 서버에서 `git pull && docker compose up -d --build`
- 비밀번호 해시 생성: `npm run hash-password -- '비밀번호'`
- 마이그레이션: `npm run db:generate` → `npm run db:migrate` (M2부터)
