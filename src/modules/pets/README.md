# 펫 룸 모듈 — 경계 매니페스트

펫 룸(여러 방 · GIF 펫 · 성장 · 관계 · 살아있는 방 연출)을 **언젠가 독립 모듈/패키지로 떼어낼**
때를 대비해, 본체(코어 앱)와의 결합을 단방향 경계로 정리한 문서다.

> ※ **분리는 나중.** 지금은 "떼어낼 때 잘릴 선"만 깨끗이 그어둔다. 파일을 물리적으로 한 폴더로
> 옮기지는 않았다(아래 "구성 파일"은 논리적 소속이다). 결합은 전부 `boundary.ts` / `auxConfig.ts`
> 두 seam을 통과하도록 모았다.

---

## 1. 공개 경계 (본체 ↔ 펫의 유일한 통로)

본체는 펫 내부(repo·lib·컴포넌트)를 직접 import 하지 않고 아래 두 파일만 쓴다. 결합은 전부
**단방향: 본체 → 펫**. 펫 모듈은 본체 기능을 import 하지 않는다("펫이 본체를 모름").

| seam | export | 방향 | 본체 호출부 |
|---|---|---|---|
| `boundary.ts` | `recordGrowth(userId, points)` | 본체 → 펫 (이벤트/쓰기) | `api/diary`, `api/transactions`, `api/transactions/quick` |
| `boundary.ts` | `getPetMiniWidget(userId)` | 본체 → 펫 (읽기) | `app/page.tsx` (홈 미니 위젯) |
| `boundary.ts` | `getPetBriefingLine(userId)` | 본체 → 펫 (읽기) | `worker/index.ts` (아침 브리핑) |
| `auxConfig.ts` | `getPetAuxConfig(userId)` | 펫 → (보조 LLM 설정) | `lib/petLines.ts` (모듈 내부) |

본체가 렌더하는 펫 **컴포넌트** `components/pets/PetMiniWidget`는 모듈의 공개 UI로 간주(데이터는
`getPetMiniWidget`이 공급). `TabBar`의 `/pets` 링크는 라우트 문자열일 뿐 코드 import 아님.

---

## 2. 모듈 구성 파일 (논리적 소속 — 분리 시 함께 이동)

- **경계(신규)**: `src/modules/pets/{boundary,auxConfig}.ts`, 본 문서.
- **테이블**(`src/db/schema.ts` 내): `pet_rooms`, `pets`, `pet_sprites`, `pet_relations`,
  `pet_lines`, `pet_custom_sprites`, `room_backgrounds`.
  마이그레이션 `0024`(v1) · `0026`(v1.5+배경 이주) · `0027`(activeness/liveliness).
- **repo**: `src/db/repo/{pets,petRooms,petSprites,petLines,petRelations,petCustomSprites,roomBackgrounds}.ts`.
- **lib**: `src/lib/{pets,petroom,petLines,petSprites,growth}.ts`.
- **컴포넌트**: `src/components/pets/*`.
- **페이지**: `src/app/pets/`(page, `[roomId]`).
- **API**: `src/app/api/pets/*`, `src/app/api/pet-rooms/*`, `src/app/api/pet-relations/*`,
  `src/app/api/pet-sprites/[...key]/*`.

---

## 3. 잔여 결합 (분리 시 함께 끊어야 할 선)

경계로 정리했지만 **물리적으로는 아직 본체에 의존**하는 지점들. 분리 시 처리 방법을 적어둔다.

1. **펫 성장 상태가 본체 `settings` 테이블에 얹혀 있음.**
   - 컬럼: `growth_date`, `growth_today`(일일 5pt 상한), `last_activity_at`(48h 잠 판정),
     `pet_last_room_id`(홈 위젯 마지막 본 방).
   - 사용처: `lib/growth.ts`(grantGrowth/isSleeping), `boundary.ts`(getPetMiniWidget).
   - 분리 시: 펫 전용 상태 테이블(예: `pet_user_state`)로 이주하고 데이터 마이그레이션.

2. **보조 모델(AUX) 연결을 본체 공통 연결과 공유.**
   - 현재 `auxConfig.ts#getPetAuxConfig` → `@/lib/config#getAuxTextConfig`(= `settings.aux_connection_id`,
     vision 캡션과 공유)에 위임.
   - 분리 시: `getPetAuxConfig` 구현만 "펫 모듈 자체 AUX 연결 설정"으로 교체. 호출부(`petLines.ts`)는
     불변.

3. **공유 인프라 의존(분리해도 함께 쓰는 공통 토대 — 끊을 필요 없음).**
   - DB 클라이언트/스키마(`src/db/client`, `schema`), `lib/llm`(completeChat),
     `lib/currentUser`, `lib/permcheck`, `lib/proactive#todayInTz`, UI 토큰/`ui/Dialog`.
   - 이들은 "본체 기능"이 아니라 플랫폼 공통 토대이므로 결합으로 보지 않는다.

---

## 4. 불변식 (회귀 방지)

- 본체 코드(`app/`(펫 외), `worker/`, 코어 `lib/`)에서 `db/repo/pet*` · `lib/pet*` ·
  `grantGrowth` · `isSleeping`를 **직접 import 하지 않는다.** 전부 `modules/pets/*` 경유.
- 펫 모듈 코드에서 `@/lib/config`(본체 설정)를 직접 import 하지 않는다. AUX는 `auxConfig.ts` 경유.
- 두 규칙 위반은 "경계를 넘는 새 결합" 신호 → 경계에 새 export를 추가해 흡수한다.
