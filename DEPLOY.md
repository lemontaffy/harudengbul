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

## 다음 단계
- **M2**: Drizzle 스키마/마이그레이션 + 로그인(비밀번호+세션) + 미들웨어.
- 비밀번호 해시: `npm run hash-password -- '내비밀번호'` → 출력값을 `.env`의 `APP_PASSWORD_HASH`에.
