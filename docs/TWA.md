# 안드로이드 APK 포장 (TWA + Bubblewrap)

웹은 이미 준비됨(PWA manifest·아이콘·서비스워커·HTTPS). 여기선 그 PWA를 **TWA**(Trusted Web Activity)로
감싸 설치형 APK/AAB 를 만든다. APK 빌드는 안드로이드 툴체인이 필요해 **로컬(개발 머신)에서** 한다.
서버 쪽 준비물(`/.well-known/assetlinks.json` 서빙)은 이 레포에 이미 들어있다.

## 0. 준비물 (로컬)
- Node 18+, JDK 17
- Bubblewrap CLI: `npm i -g @bubblewrap/cli` (필요한 JDK/Android SDK 는 bubblewrap 이 받아준다)

## 1. TWA 프로젝트 생성 (레포 밖 별도 폴더에서)
```bash
mkdir haru-twa && cd haru-twa
bubblewrap init --manifest https://haru.daltavern.org/manifest.webmanifest
```
- **Application id**: `org.daltavern.haru` (= 서버 .env 의 `TWA_PACKAGE_NAME` 과 동일해야 함)
- 앱 이름/색/아이콘은 manifest 에서 자동으로 채워진다.
- 서명 키: 새로 생성(`android.keystore`). **비밀번호를 안전히 보관** — 분실하면 같은 앱 업데이트 불가.
  키스토어·비번은 절대 레포에 커밋하지 말 것.

## 2. 서명 키 지문(SHA-256) 확인
```bash
bubblewrap fingerprint list
# 또는
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```
`AB:CD:EF:...` 형태의 SHA-256 값을 복사.

## 3. 서버에 assetlinks 연결 (도메인 ↔ 앱 증명)
서버 `.env` 에 채우고 배포:
```
TWA_PACKAGE_NAME=org.daltavern.haru
ASSETLINKS_FINGERPRINTS=AB:CD:EF:...        # 2번 값. 여러 개면 쉼표로
```
```bash
./scripts/deploy.sh
curl -s https://haru.daltavern.org/.well-known/assetlinks.json   # package_name + 지문 보이면 OK
```
이 파일은 `src/app/.well-known/assetlinks.json/route.ts` 가 env 로 서빙한다(미들웨어·인증 무관 공개).

## 4. 빌드 & 설치
```bash
bubblewrap build        # app-release-signed.apk + app-release-bundle.aab 생성
# 폰에 USB 연결 후
adb install ./app-release-signed.apk
# 또는 apk 파일을 폰으로 보내 직접 설치
```
앱 실행 시 **주소창 없이 전체화면**이면 assetlinks 검증 성공. 주소창이 보이면 지문/패키지명/도메인
불일치 → 3번을 다시 확인(특히 `TWA_PACKAGE_NAME` == Application id, 지문 일치, assetlinks 응답).

## 5. 이후 운영
- **웹 변경**: 그냥 `./scripts/deploy.sh`. 앱은 웹뷰라 내용이 자동 반영(앱 재빌드 불필요).
- **앱 자체 변경**(아이콘·버전·스플래시): `bubblewrap update && bubblewrap build`.
- **Play 스토어 배포 시**: Play 앱 서명을 쓰면 Play 콘솔의 서명 인증서 SHA-256 도
  `ASSETLINKS_FINGERPRINTS` 에 **추가**(쉼표) 후 재배포. AAB(`app-release-bundle.aab`) 업로드.
- **iOS**: TWA 없음. 사파리에서 "홈 화면에 추가"(PWA, 16.4+)로 설치.
