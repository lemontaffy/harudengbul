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

## M2 — 로그인 + DB + 설정(API 연결) GUI

### 추가로 채울 .env (M1보다 더 필요)
```bash
# 비밀번호 해시 생성 → 출력값을 APP_PASSWORD_HASH 에
npm run hash-password -- '내비밀번호'      # 로컬에 node 있으면. 없으면:
docker compose run --rm worker npm run hash-password -- '내비밀번호'

SESSION_SECRET=$(openssl rand -base64 32)  # .env 에 기입
OPENROUTER_API_KEY / OPENROUTER_MODEL      # 비워도 로그인은 됨. 채팅(M3)부터 필요.
                                           # 또는 로그인 후 /settings 화면에서 입력(DB 저장).
```

### 기동 (마이그레이션 자동)
```bash
docker compose up -d --build
```
- `migrate` 원샷 서비스가 db healthy 후 **마이그레이션 + 시드(settings/페르소나)**를 자동 실행하고, 그게 끝나야 app/worker가 뜬다.
- 확인: `docker compose logs migrate` → `[migrate] 완료` / `[seed] 완료`.

### 검증
1. `https://haru.daltavern.org` → 자동으로 **/login** 으로 이동
2. 비밀번호 로그인 → 홈
3. **설정 / API 연결** → OpenRouter API 키·모델 입력 후 저장 → "DB(화면 설정)" 출처로 표시
4. 로그아웃 → 다시 보호 라우트 차단 확인

> 설정값 우선순위: **DB(화면) > env(.env)**. 화면에서 비우면 env로 폴백.

## 다음 단계
- **M3**: 채팅(SSE 스트리밍, 페르소나 전환) — `/settings`에서 넣은 OpenRouter 설정 사용.
