# Google 캘린더 연동 (OAuth)

앱 일정 ↔ Google 캘린더 양방향 동기화. 사용자별로 자기 Google 계정을 연결한다.
서버 코드는 준비돼 있고, **Google Cloud 콘솔에서 OAuth 클라이언트 1개**만 만들어 env 에 넣으면 된다.

## 1. Google Cloud 콘솔 설정 (한 번만)
1. https://console.cloud.google.com → 프로젝트 생성/선택.
2. **APIs & Services → Library** → "Google Calendar API" 사용 설정(Enable).
3. **OAuth consent screen**:
   - User type: External. 앱 이름/이메일 입력.
   - Scopes: `.../auth/calendar`, `.../auth/userinfo.email` 추가.
   - Test users: 본인(과 지인) Google 이메일 추가(게시 전엔 테스트 사용자만 로그인 가능).
     (원하면 나중에 Publish 하되, calendar 스코프는 Google 검증이 필요할 수 있음 — 소수 사용이면 테스트 모드로 충분)
4. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs**: `https://haru.daltavern.org/api/google/callback`
   - 생성된 **Client ID / Client secret** 복사.

## 2. 서버 .env
```
GOOGLE_CLIENT_ID=<위 Client ID>
GOOGLE_CLIENT_SECRET=<위 Client secret>
```
APP_ORIGIN 이 `https://haru.daltavern.org` 인지 확인(리다이렉트 URI 와 일치해야 함). 그리고:
```bash
./scripts/deploy.sh
```

## 3. 연결 & 동작
- 앱에서 **설정 → Google 캘린더 → 연결** → 구글 동의 → 돌아오면 "연결됨".
- 양방향:
  - **앱 → Google**: 일정 추가/수정/삭제 시 즉시 미러링(best-effort).
  - **Google → 앱**: 워커가 **15분마다** 증분 동기화(syncToken). 설정에서 "지금 동기화"로 즉시 당겨올 수도.
- 충돌은 last-write-wins(마지막에 바꾼 쪽이 이김). 에코 루프는 `google_event_id` 매핑으로 방지.
- **해제**: 설정에서 "연결 해제"(토큰 폐기). 이미 동기화된 일정은 로컬에 남는다.

## 참고/한계
- 토큰은 `lib/crypto`(AES-256-GCM)로 암호화 저장(`APP_ENCRYPTION_KEY`).
- primary 캘린더만 동기화(MVP). 반복 일정은 단일 인스턴스로 펼쳐 받음(singleEvents).
- 푸시 실패분은 다음 동기화의 "push 보정"이 회수(로컬에만 있는 일정 → Google 로 올림).
- "재동의 필요(norefresh)" 안내가 뜨면: Google 계정 → 보안 → 서드파티 앱에서 이 앱을 제거 후 다시 연결
  (refresh_token 재발급).
