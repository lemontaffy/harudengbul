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
로컬에서 `docker compose up --build`로 스모크 → 서버에서 **`./scripts/deploy.sh`** 한 방.

`deploy.sh` = `git pull` → `docker compose build` → `docker compose run --rm migrate`(마이그레이션+시드,
**항상 실행**) → `docker compose up -d`. 마이그레이션을 명시적으로 항상 돌려 재배포 시 누락
(`--build` 깜빡/일회용 서비스 미재실행)을 막고, 마이그레이션 실패 시 멈춰 깨진 코드가 안 뜨게 한다.
수동으로 풀어 쓰면:
```bash
cd /opt/haru
git pull --ff-only
docker compose build
docker compose run --rm migrate   # ← 핵심: 항상 마이그레이션
docker compose up -d
```

## M2 (멀티유저) — 로그인 + DB + 초대제 + 어드민

> DELTA-multiuser 적용: 초대제 멀티유저. 첫 admin은 env로 부트스트랩.

### 채울 .env (핵심)
```bash
# 관리자 비밀번호 해시 → APP_PASSWORD_HASH 에 (반드시 작은따옴표로!)
docker compose run --rm tools npm run hash-password -- '관리자비밀번호'

# 세션 시크릿 / 키 암호화 키
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY (llm_api_key 암호화; 없으면 SESSION_SECRET 파생)
```

> 운영 스크립트는 일회용 `tools` 서비스로 실행한다(표준 경로):
> `docker compose run --rm tools npm run <script>` (db:migrate / db:seed / encrypt-keys /
> reset-password -- <id> / test:isolation). `profiles: ["tools"]`라 평소 `up`엔 안 뜬다.
| 키 | 비고 |
|---|---|
| `POSTGRES_PASSWORD` | 영숫자만. `DB_URL` 비번과 **동일** |
| `DB_URL` | `postgres://haru:<위와 동일>@db:5432/haru` |
| `ADMIN_USERNAME` | 첫 관리자 아이디 (예: admin) |
| `APP_PASSWORD_HASH` | 해시 출력값. **`'$argon2id$...'` 작은따옴표 필수** |
| `SESSION_SECRET` | openssl 출력 |
| `APP_ORIGIN` | `https://haru.daltavern.org` (초대 링크용) |
| `LLM_*` | 비워도 됨. 로그인 후 각자 `/settings`에서 입력 |

### 기동 (마이그레이션 자동)
```bash
docker compose up -d --build
docker compose logs migrate     # "[seed] admin 생성: admin (id=1)" 나오면 OK
```

### 검증
1. `https://haru.daltavern.org` → **/login** → `admin`/비번 로그인
2. **어드민** → 초대 발급(7일) → 가입 링크 복사
3. **설정** → AI 연결(공급사 프리셋·키·모델 불러오기) 입력 → "연결됨"
4. 지인에게 링크 → `/signup?code=...` 가입 (멤버는 `/admin` 차단, 데이터 격리)

> AI 연결은 **사용자별**. 격리 회귀 테스트: `docker compose run --rm tools npm run test:isolation`.
> 배포 후 1회 기존 평문 키 암호화: `docker compose run --rm tools npm run encrypt-keys`.

## 트러블슈팅
- **`password authentication failed for user "haru"`** (migrate exit 1)
  → 비번 불일치 또는 **스테일 볼륨**. 비번은 `./data/pg` 최초 생성 때만 적용됨.
  ```bash
  docker compose down && sudo rm -rf ./data/pg && docker compose up -d --build
  ```
  + `POSTGRES_PASSWORD` == `DB_URL` 비번 확인(특수문자 없는 영숫자 권장).
- **`The "argon2id"/"v"/"m"... variable is not set` 경고**
  → `APP_PASSWORD_HASH` 의 `$` 를 compose가 변수로 해석. **값을 작은따옴표로 감쌀 것**:
  `APP_PASSWORD_HASH='$argon2id$v=19$...'`

## 다음 단계
- **M3**: 채팅(SSE 스트리밍, 페르소나 전환) — 사용자별 AI 연결 + 사용자별 기억/컨텍스트(userId 스코프).
