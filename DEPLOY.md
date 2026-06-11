# 배포 / 검증 절차

## M1 — 터널 → HTTPS 도달 (현재 단계)

### 1. Cloudflare Tunnel에 haru 등록 (한 번만)
Zero Trust 대시보드 → Networks → Tunnels → `daltavern-tunnel` → Public Hostname 추가:

| 항목 | 값 |
|---|---|
| Subdomain | `haru` |
| Domain | `daltavern.org` |
| Service | `http://localhost:3000` |

저장하면 `haru.daltavern.org` DNS(CNAME)가 자동 생성된다. (marinara `samchi → localhost:7861`과 동일 패턴)

### 2. 서버에 코드 + .env 배치
```bash
cd /opt/haru          # 레포 위치
git pull              # 또는 최초 git clone
cp .env.example .env  # 최초 1회
# .env 채우기: POSTGRES_PASSWORD, DB_URL, OPENROUTER_API_KEY,
#              SESSION_SECRET(openssl rand -base64 32) 등.
#   (M1 검증만이면 OPENROUTER/APP_PASSWORD_HASH는 비워도 Hello 페이지는 뜸)
```

### 3. 빌드 & 기동
```bash
docker compose up -d --build
docker compose ps          # app/worker/db 모두 Up, db는 healthy
docker compose logs -f app # 기동 로그 확인
```

### 4. 검증
```bash
# 서버 로컬에서 (app은 127.0.0.1:3000 바인딩)
curl -s localhost:3000/api/health     # {"ok":true,"service":"haru-app"}
```
브라우저: **https://haru.daltavern.org** → "하루등불 / M1 OK" 페이지 + 자물쇠(HTTPS).
→ 여기까지 되면 **M1 완료**.

## 배포 루프 (이후 공통)
로컬에서 `docker compose up --build`로 스모크 → 서버에서 `git pull && docker compose up -d --build`.

## M2 (멀티유저) — 로그인 + DB + 초대제 + 어드민

> DELTA-multiuser 적용: 초대제 멀티유저. 첫 admin은 env로 부트스트랩.

### 추가로 채울 .env
```bash
# 첫 관리자 비밀번호 해시 → APP_PASSWORD_HASH 에
npm run hash-password -- '관리자비밀번호'
#   (로컬 node 없으면: docker compose run --rm worker npm run hash-password -- '...')
ADMIN_USERNAME=admin                       # 첫 관리자 아이디
SESSION_SECRET=$(openssl rand -base64 32)  # .env 에 기입
APP_ORIGIN=https://haru.daltavern.org      # 초대 가입 링크 생성에 사용
OPENROUTER_API_KEY / OPENROUTER_MODEL      # 비워도 됨. 로그인 후 /admin 에서 입력 가능(전역).
```

### 기동 (마이그레이션 자동)
```bash
docker compose up -d --build
```
- `migrate` 원샷이 db healthy 후 **마이그레이션 + 시드**(app_config + admin 부트스트랩) 실행 → 끝나면 app/worker 기동.
- 확인: `docker compose logs migrate` → `[seed] admin 생성: admin (id=1)`.

### 검증
1. `https://haru.daltavern.org` → **/login**
2. `admin` / 설정한 비밀번호로 로그인 → 홈에 **어드민** 버튼
3. **어드민** → OpenRouter 전역 설정(키/모델) 저장, **초대 발급(7일)** → 가입 링크 복사
4. 지인에게 링크 전달 → `/signup?code=...` 로 멤버 가입 (이메일 없음)
5. 멤버는 `/admin` 접근 불가(홈 리다이렉트), 데이터는 사용자별 격리

> OpenRouter 연결은 **전역(admin 관리)**, 우선순위 **app_config(DB) > env**. 멤버는 공유해서 사용.
> 격리 회귀 테스트: `npm run test:isolation` (DB_URL 필요).

## 다음 단계
- **M3**: 채팅(SSE 스트리밍, 페르소나 전환) — 전역 OpenRouter 설정 + 사용자별 기억/컨텍스트(userId 스코프) 사용. `daily_message_limit` 적용.
