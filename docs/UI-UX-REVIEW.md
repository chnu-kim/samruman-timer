# UI/UX 리뷰

## 1. 개요

- **리뷰 일자**: 2026-10-02
- **대상**: 삼루먼타이머 웹앱 전체(로그인, 프로젝트 목록·상세, 타이머 상세·상태별 화면, 통계, OBS 오버레이와 설정 모달)
- **방법**
  1. 로컬 dev 서버에 시드 데이터를 넣었다. 소유자 '삼루만'의 RUNNING·SCHEDULED·EXPIRED 타이머, 타이머 없는 프로젝트, 다른 스트리머의 잔여 4분 RUNNING 타이머, 프로젝트가 0개인 신규 유저가 들어 있다.
  2. Playwright로 23개 화면 상태를 캡처했다. 데스크톱(1440x900)과 모바일(390x844 @2x), 라이트와 다크 조합을 전체 페이지로 찍었다. 필요한 곳에서는 DOM 측정(대비, 터치 영역, `elementFromPoint`, 네트워크 요청 가로채기)으로 보충했다.
  3. 9개 영역(인증·목록, 프로젝트 상세, 타이머 조작, 타이머 상태, 오버레이, 통계, 접근성, 일관성, 모바일)을 따로 리뷰했다. 이어서 누락을 찾는 완전성 점검을 한 번 더 했다.
  4. **지적 하나하나를 독립된 반박 검증에 넘겼다.** 사실 관계, 심각도, 이미 백로그(`UX-IMPROVEMENTS.md`)에 있는지, 장식성 여부를 다시 확인했다. 그 결과 심각도와 권고를 다수 조정했다.
  5. 영역 사이의 중복 지적을 합치고, 장식이나 취향 수준의 제안은 빼거나 최소안으로 줄였다.
- **평가 원칙**
  - 모든 지적에는 근거가 있어야 한다. 근거는 스크린샷의 위치, 코드 `file:line`, 그리고 방송 중 급하게 조작하는 스트리머나 시청자에게 왜 문제인지다.
  - 화려함은 지양한다. 애니메이션, 그라데이션, 새 기능처럼 구체적인 사용성 문제를 풀지 않는 제안은 내지 않는다. 불필요하게 복잡한 요소는 오히려 제거나 단순화를 권한다.
  - 권고는 문제를 푸는 최소 변경으로 쓴다.
  - 심각도 기준은 다음과 같다. critical은 핵심 과업 실패, 데이터 손실 위험, 접근 불가다. major는 핵심 과업 지연, 오조작 유발, 명확한 접근성 위반이다. minor는 혼란과 비일관이다. nit은 사소한 것이다.
- **제외한 것**: 좌하단 'N' 버튼(Next.js dev 인디케이터), 시드가 인위적으로 만든 '옆집 타이머'의 생성일·잔여 시간 불일치, 비로그인 상태의 `/api/auth/me` 401 콘솔 로그.
- 스크린샷은 `docs/ux-review/`에 있다. 파일명 형식은 `<번호>-<화면>--<d|m>-<light|dark>.png`이고, d는 데스크톱, m은 모바일이다. 리뷰와 검증 중에 추가로 찍은 측정용 캡처(예: [C2-m-quick-300ms.png](ux-review/measure/C2-m-quick-300ms.png))는 `docs/ux-review/measure/`에 있다.

## 2. 종합 평가

| 영역 | 점수(10) | 근거 |
|---|---|---|
| 인증·프로젝트 목록 | 7 | 로딩, 오류, 검색 결과 없음, 빈 상태가 모두 구분되어 있고 막힘이 없다. 다만 카드에 타이머 상태가 없고, 아이콘 크기 클래스가 무시되며, 탭 포커스가 어긋난다. |
| 프로젝트 상세 | 7 (6.5→7) | 권한 분기와 삭제 확인이 정확하다. major로 올라온 2건(제목 편집 겹침, h1 의미 상실)은 검증에서 minor로 내려가 점수를 올렸다. |
| 타이머 조작(소유자) | 5 | 기본 흐름(입력 → 확인 → 낙관적 갱신)은 좋다. 하지만 키보드와 모바일 빠른 경로에 critical 1건, major 3건이 몰려 있다. |
| 타이머 상태별 화면 | 6.5 (6→6.5) | 예약 상태 전달과 권한 분기는 우수하다. 만료 재시작 예고는 minor로 조정했지만, 만료 임박 숫자 대비(major)는 남는다. |
| OBS 오버레이 | 7 (6→7) | 오버레이 페이지 자체(투명 배경, 그림자, 고정폭 숫자, 재동기화)는 방송에 적합하다. 설정 모달의 major 3건은 검증 결과 모두 '안내 부족' 수준(minor)으로 확인되어 올렸다. |
| 통계 | 5.5 | 레이아웃과 상태 처리는 탄탄하다. 그러나 핵심 정보인 피크 시간과 일별 집계가 UTC 기준이라 9시간 어긋난다. |
| 접근성 | 4 | 공용 컴포넌트의 기본기는 갖췄다. 반면 소유자 타이머 화면에서 Tab 키가 막혀 키보드 이동이 불가능하고, 포커스 링, 긴급 숫자, 배지에서 AA 대비 미달이 반복된다. |
| 일관성 | 6.5 | 토큰화, 빈 상태 패턴, 확인 다이얼로그가 일관된다. 그러나 '+' 라벨 프리셋이 차감하는 문제와 '취소/취소하기' 문구 충돌이 있다. |
| 모바일 | 6 | 측정한 모든 화면에 가로 스크롤이 없고 표가 카드로 전환된다. 다만 방송 중 휴대폰으로 시간을 추가하는 핵심 시나리오에서 토스트가 탭을 가로챈다. |

**총평 (약 6/10)**: 화면 구조, 상태 처리, 다크 모드, 권한 분기 같은 기본기는 개인 프로젝트로서 단단한 편이다. 장식 요소도 거의 없어 걷어낼 것이 적다. 문제는 스트리머가 방송 중 가장 급하게 쓰는 **빠른 경로**에 집중되어 있다. 키보드 단축키(Tab 가로채기, 보이지 않는 차감 모드, 모달 뒤 실행), 빠른 적용 모드(+ 라벨인데 차감), 모바일 하단 바(토스트가 탭을 가로챔)가 그렇다. 이 경로들은 '빠르게'를 위해 만든 만큼 확인 단계가 없어서, 결함이 곧 잘못된 시간 기록으로 이어진다. 그다음으로 큰 덩어리는 라이트 모드의 대비 미달(포커스 링, 배지, 긴급 숫자, 차트 축)이다. 대부분 토큰이나 클래스 한두 줄로 고칠 수 있다.

## 3. 잘 된 점

- **목록 상태가 명확히 갈린다.** 스켈레톤, 오류와 재시도, '검색 결과가 없습니다', '아직 프로젝트가 없습니다'를 구분하고(`src/app/projects/page.tsx:250-276`), 신규 유저에게는 '첫 프로젝트 만들기' CTA를 '내 프로젝트' 탭에서만 보여 준다([06-projects-empty-newuser--d-light.png](ux-review/06-projects-empty-newuser--d-light.png)).
- **권한별 UI 분기가 정확하다.** 비소유자와 비로그인 시청자에게는 편집, 시간 조작, 통계, 삭제, OBS 설정이 모두 숨겨지고 키보드 단축키도 막힌다([10-project-detail-nonowner--d-light.png](ux-review/10-project-detail-nonowner--d-light.png), [18-timer-loggedout-viewer--d-light.png](ux-review/18-timer-loggedout-viewer--d-light.png), `src/app/timers/[id]/page.tsx:278`).
- **예약 상태가 색, 문구, 조작 패널 세 경로로 전달된다.** '시작 대기 중 · 시각' 서브텍스트와 '예약된 타이머는 시작 전까지 시간을 변경할 수 없습니다.' 안내가 함께 나온다([15-timer-scheduled--d-light.png](ux-review/15-timer-scheduled--d-light.png), `CountdownDisplay.tsx:114-118`, `TimerControls.tsx:196-204`).
- **시간 추가가 즉시 화면에 반영된다.** 낙관적 갱신이라 서버 응답 전에 카운트다운이 바뀌고, 확인 버튼이 '추가 확인 (2시간)'처럼 방향과 양을 되읽어 준다(`TimerControls.tsx:102-107, 404-406`).
- **파괴적 작업은 모두 확인 다이얼로그를 거친다.** 네이티브 `<dialog>` 기반이라 첫 포커스가 빠져나가는 버튼('돌아가기')에 놓이고, ESC 후 포커스가 원래 자리로 돌아온다. 프로젝트 삭제 문구는 '타이머·목표·변경 기록이 함께 지워지고 되돌릴 수 없습니다.'처럼 잃는 것을 결과로 설명한다([13-timer-delete-confirm--m-light.png](ux-review/13-timer-delete-confirm--m-light.png), `ConfirmDialog.tsx:33-55`).
- **오버레이가 방송용으로 잘 만들어졌다.** html과 body 배경이 실제로 투명하고(측정값 `rgba(0,0,0,0)`), 기본 그림자, 고정폭 숫자, 5초 재동기화를 갖췄다. 긴급과 만료 상태는 색만이 아니라 '만료됨', '시작 대기 중' 텍스트로도 전달된다([20-overlay--d-dark.png](ux-review/20-overlay--d-dark.png), [21-overlay-urgent--d-dark.png](ux-review/21-overlay-urgent--d-dark.png), `overlay/page.tsx:35, 104-125, 150, 262-288`).
- **모바일 레이아웃이 버틴다.** 390px에서 측정한 9개 화면 모두 `scrollWidth`가 390이다. 변경 기록과 후원자 랭킹은 카드로 바뀌고, 하단 빠른 바 버튼은 약 110x48px이며, 닉네임이 없으면 이유를 보여 주며 비활성화된다([11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png), [19-timer-stats--m-dark.png](ux-review/19-timer-stats--m-dark.png)).
- **색을 토큰으로 관리하고 다크 모드를 체계적으로 재정의한다**(`globals.css:5-69`). 다크 모드 텍스트는 측정한 8개 화면에서 AA를 통과했다(차트 눈금 제외).
- **장식 요소가 거의 없다.** 일반 화면에는 그라데이션이나 장식 일러스트가 없어 시선이 카운트다운과 조작부로 바로 간다.

## 4. 지적 사항

요약: critical 1, major 8, minor 34, nit 31. 같은 원인을 여러 영역에서 지적한 경우 하나로 합쳤다.

### Critical

#### UX-01. 소유자 타이머 화면에서 Tab 키가 단축키로 가로채여 키보드 포커스가 움직이지 않는다(모달 안 포함)
- **상태**: 해결 — Tab 단축키를 없애고 추가/차감 전환을 `X`로 옮겼다. 한국어 IME에서도 동작하도록 `e.code`(`KeyX`)로 판별하고 Cmd/Ctrl/Alt 조합은 무시한다. 도움말과 `docs/UI.md`에 단축키 목록을 맞췄다.
- **심각도**: critical · **영역**: 접근성 / 타이머 조작
- **관찰**: `SHORTCUTS`에 `"Tab": { toggleAction: true }`가 있다. window keydown 핸들러는 대상이 INPUT, TEXTAREA, SELECT가 아니면 `preventDefault()`를 호출한다. 이 동작은 소유자이면서 상태가 RUNNING이나 EXPIRED일 때 항상 켜져 있다. 실측 결과 body에서 Tab을 10번 눌러도 포커스가 BODY에 머물렀다. 삭제 확인 창에서는 '취소'에서, 오버레이 설정 모달에서는 '닫기'에서 포커스가 움직이지 않았다. Tab을 누를 때마다 추가와 차감 방향만 뒤집힌다(UX-02로 이어진다).
- **이유**: 키보드 사용자는 닉네임 입력란 밖으로 나갈 수 없다. 삭제 확인 창의 '삭제'와 오버레이 '저장'에도 닿을 수 없다. WCAG 2.1.1(A) 위반이다.
- **권고**: `SHORTCUTS`와 `SHORTCUT_HELP`에서 Tab을 빼고, 탐색과 충돌하지 않는 단일 문자 키(예: `x`)로 옮긴다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [12-timer-overlay-settings--d-light.png](ux-review/12-timer-overlay-settings--d-light.png), [13-timer-delete-confirm--d-light.png](ux-review/13-timer-delete-confirm--d-light.png), [14-timer-shortcut-help--d-light.png](ux-review/14-timer-shortcut-help--d-light.png) · `src/hooks/useKeyboardShortcuts.ts:25, 41-53, 78`, `src/app/timers/[id]/page.tsx:277-283`

### Major

#### UX-02. 단축키가 화면에 보이지 않는 추가/차감 상태를 따로 가지고 있어, UI가 '추가'인데 숫자키를 누르면 차감된다
- **상태**: 해결 — `selectedAction`을 page가 소유하고 `TimerControls`에 `selectedAction`·`onActionChange`로 내려, 세그먼트·프리셋 라벨·단축키가 상태 하나를 공유한다. 도움말 문구도 '+1시간'에서 '1시간 추가/차감'으로 바꿨다.
- **심각도**: major · **영역**: 타이머 조작 / 접근성
- **관찰**: `page.tsx:136`의 `selectedAction`과 `TimerControls.tsx:71`의 `selectedAction`은 별개의 state다. 단축키 토글은 page 쪽만 바꾼다. 실측(기본 닉네임 설정 후 Tab, 1)에서 세그먼트는 '추가'(aria-checked)로 남아 있었는데 `{action:"SUBTRACT", deltaSeconds:3600}`이 전송됐다. 이 상태 변화를 알 수 있는 단서는 전송 뒤에 뜨는 '차감 완료' 토스트뿐이다. 도움말에도 '1 = +1시간'으로 적혀 있다.
- **이유**: 후원을 읽어 주며 1을 누른 스트리머의 타이머에서 1시간이 빠진다. 잘못된 차감은 로그, 그래프, 통계에 그대로 남는다. 되돌릴 수는 있지만 방송 화면에 먼저 노출된다.
- **권고**: `selectedAction`을 page로 끌어올려 `TimerControls`에 `selectedAction`과 `onActionChange` prop으로 내려 준다. 그러면 세그먼트, 프리셋 라벨, 단축키 요청이 상태 하나를 공유한다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [14-timer-shortcut-help--d-light.png](ux-review/14-timer-shortcut-help--d-light.png) · 측정 캡처 [D2-after-1.png](ux-review/measure/D2-after-1.png), [D3-after-1-done.png](ux-review/measure/D3-after-1-done.png) · `src/app/timers/[id]/page.tsx:136, 231-259`, `src/components/timer/TimerControls.tsx:71`

#### UX-03. 데스크톱 빠른 적용 모드에서 '+1시간' 버튼이 차감 모드일 때 시간을 즉시 뺀다
- **상태**: 해결 — 빠른 적용 모드에서 차감이면 프리셋 라벨을 `-`로 바꾸고, 차감 확인 버튼에 `variant="danger"`를 준다. 이후 빠른 적용 모드 자체를 없앴다(카드 프리셋은 누적만, 즉시 적용은 하단 바·숫자키).
- **심각도**: major · **영역**: 일관성 / 타이머 조작
- **관찰**: 데스크톱 프리셋 라벨은 항상 `+{preset.label}`이다(`:346`). 빠른 적용 모드에서는 클릭 즉시 `submitModify(selectedAction, …)`를 호출하므로(`:338, :166`), 차감을 선택한 상태에서 '+1시간'을 누르면 확인 없이 1시간이 빠진다. 모바일 하단 바는 부호를 '-'로 바꾸고 빨간색을 쓴다(`:426`). 데스크톱 확인 버튼은 차감 모드에서도 accent 보라색 그대로다.
- **이유**: 급하게 클릭하는 스트리머는 토글이 아니라 버튼 라벨을 읽는다. '+'라고 적힌 버튼이 시간을 빼면 그 결과가 즉시 방송 화면과 로그에 반영된다.
- **권고**: 빠른 적용 모드에서만 라벨 부호를 `selectedAction`에 따라 바꾼다. `{quickMode && selectedAction === "SUBTRACT" ? "-" : "+"}`처럼 하면 된다. 차감 모드의 확인 버튼에는 이미 있는 `variant="danger"`를 준다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png) · `src/components/timer/TimerControls.tsx:166, 338, 346, 398-407, 426`

#### UX-04. 삭제 확인 창이나 오버레이 설정 모달이 열려 있어도 숫자 단축키가 타이머 시간을 바꾼다
- **상태**: 해결 — 삭제 확인 창·오버레이 설정 모달이 열려 있으면 단축키를 끄고, 도움말이 열려 있으면 훅이 숫자키와 전환만 무시한다(`?`, R, G, ESC는 유지).
- **심각도**: major · **영역**: 접근성 / 타이머 조작
- **관찰**: 키 핸들러는 모달이 열려 있는지 확인하지 않는다. 실측 결과 삭제 확인 창에서 '취소'에 포커스를 둔 채 '5'를 누르자 ADD 18000초가, 오버레이 모달에서 '닫기'에 포커스를 둔 채 '0'을 누르자 36000초 요청이 나갔다. 입력 필드 안의 숫자 입력은 기존 INPUT 가드로 걸러진다.
- **이유**: 모달은 뒤쪽 화면을 막는다는 약속이다. 그런데 그 뒤에서 시간 단위의 변경이 조용히 실행된다.
- **권고**: `page.tsx:278`의 `enabled`에 `!showDeleteDialog && !showOverlaySettings`를 추가한다. 도움말 모달은 훅 내부에서 프리셋과 토글만 무시하고, '?'와 ESC는 계속 동작하게 둔다.
- **근거**: [13-timer-delete-confirm--d-light.png](ux-review/13-timer-delete-confirm--d-light.png), [12-timer-overlay-settings--d-light.png](ux-review/12-timer-overlay-settings--d-light.png) · `src/hooks/useKeyboardShortcuts.ts:36-64`, `src/app/timers/[id]/page.tsx:277-283, 689-712`

#### UX-05. 모바일에서 즉시 적용 직후 3초 동안 토스트가 하단 바의 +10h 탭을 가로챈다
- **상태**: 해결 — 토스트의 `pointer-events-auto`를 빼서 탭이 하단 바로 통과하게 했고, md 미만에서는 컨테이너를 `bottom-24`로 올려 라벨도 가리지 않게 했다.
- **심각도**: major · **영역**: 모바일 / 타이머 조작
- **관찰**: 토스트 컨테이너는 `fixed bottom-4 right-4 z-50`이고, 항목에는 `pointer-events-auto`가 붙어 있다. 이 토스트가 하단 바(`fixed bottom-0 z-40`)의 +10h 위에 3초 동안 겹친다. 실측 결과 +10h 중앙의 `elementFromPoint`는 토스트였고, 그 지점을 탭해도 modify 요청 수는 늘지 않았다. 버튼 영역 9개 지점 중 6개가 가려졌다. 실패할 때는 토스트 두 개가 쌓여 +5h까지 덮는다.
- **이유**: 후원이 몰려 연속으로 탭할 때 입력이 아무 표시 없이 누락된다. 하단 바의 존재 이유인 빠른 연속 입력이 깨진다.
- **권고**: 토스트에는 상호작용 요소가 없으므로 `Toast.tsx:66`에서 `pointer-events-auto`를 빼서 탭이 아래로 통과하게 한다(컨테이너는 이미 `pointer-events-none`이다). 라벨 가림까지 없애려면 md 미만에서 컨테이너를 바 위(`bottom-24 md:bottom-4` 정도)로 올린다.
- **근거**: [24-timer-add-flow--m-light.png](ux-review/24-timer-add-flow--m-light.png) · 측정 캡처 [C2-m-quick-300ms.png](ux-review/measure/C2-m-quick-300ms.png), [E1-m-500.png](ux-review/measure/E1-m-500.png), [mob/toast-over-bar.png](ux-review/measure/mob/toast-over-bar.png) · `src/components/ui/Toast.tsx:55, 61, 66`, `src/components/timer/TimerControls.tsx:411`

#### UX-06. 통계의 시간대 차트, 피크 시간대, 일별 차트가 UTC로 집계되어 한국 시간과 9시간 어긋난다
- **상태**: 해결 — 시간대·일별 집계 SQL에 `'+9 hours'` modifier를 적용해 KST로 묶는다(피크 시간대는 시간대 결과에서 따라온다). `docs/API.md`에 KST 기준을 적었다.
- **심각도**: major · **영역**: 통계
- **관찰**: `created_at`은 UTC ISO 문자열인데(`db.ts:15`), 통계 API가 이를 `strftime('%H', created_at)`와 `DATE(created_at)`로 그대로 묶는다. 화면의 '피크 시간대 1시'는 실제로 KST 10시다. KST 00~09시 이벤트는 전날 막대에 들어간다. 반면 변경 기록 화면은 ko-KR 로컬 시각으로 표시하므로, 같은 이벤트가 두 화면에서 다른 시각으로 보인다. 화면 어디에도 'UTC'라는 표기는 없다.
- **이유**: 이 페이지의 존재 이유가 '몇 시에 후원이 몰리는가'다. 틀린 값을 믿고 방송 시간을 정하게 된다.
- **권고**: 세 쿼리에 `'+9 hours'` modifier를 추가한다(`strftime('%H', created_at, '+9 hours')`, `DATE(created_at, '+9 hours')`). 한국 전용 서비스이므로 tz 파라미터까지는 필요 없다.
- **근거**: [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png), [19-timer-stats--m-dark.png](ux-review/19-timer-stats--m-dark.png) · `src/app/api/timers/[id]/stats/route.ts:80, 104, 123-132`, `src/lib/db.ts:15`, `src/components/stats/StatsCardGrid.tsx:41`

#### UX-07. 공용 포커스 링(`--ring`, 알파 40%)의 대비가 1.7:1(라이트), 1.95:1(다크)이다
- **상태**: 해결 — `--ring`을 불투명 accent로 바꿨다(라이트 `#4f46e5`, 다크 `#818cf8`). UX-28로 라이트 accent가 `#4f46e5`가 되어 권고의 `#6366f1` 대신 새 accent 값을 따랐다. 흰 배경 대비 6.29:1, 다크 배경 대비 6.64:1이다.
- **심각도**: major · **영역**: 접근성
- **관찰**: `--ring`은 `rgba(99,102,241,0.4)`(다크에서는 `rgba(129,140,248,0.4)`)이다. 34곳에서 `focus-visible:outline-none`으로 브라우저 기본 outline을 지우고 이 링으로 대체한다. 프로젝트 카드에 포커스를 줘도 연보라 테두리가 hover 그림자와 잘 구분되지 않는다.
- **이유**: WCAG 1.4.11(비텍스트 대비 3:1, AA) 미달이다. 키보드 사용자는 지금 어디에 있는지 알기 어렵다.
- **권고**: `globals.css:15, 49, 66`의 `--ring`을 불투명 accent(라이트 `#6366f1`, 다크 `#818cf8`)로 바꾼다. 34곳이 한 번에 고쳐진다.
- **근거**: [03-projects-mine--d-light.png](ux-review/03-projects-mine--d-light.png) · 측정 캡처 [a11y-focus-projects.png](ux-review/measure/a11y-focus-projects.png) · `src/app/globals.css:15, 49, 66`, `src/components/ui/Button.tsx:37`

#### UX-08. 만료 임박 카운트다운(라이트 amber-500)이 2.1:1이고, 무한 펄스가 대비를 더 떨어뜨린다
- **상태**: 해결 — 라이트 색을 `text-amber-700`(5.05:1)·`text-red-600`(4.76:1)으로 바꿨다. 펄스를 인라인 style에서 `animate-pulse-urgent-slow/fast` 클래스로 옮기고 `prefers-reduced-motion: reduce`에서 끄는 규칙을 `globals.css`에 추가했다. 오버레이 펄스는 UX-24 범위로 남겼다. 남은 점: 펄스 최저점(opacity 0.7/0.5)에서는 amber-700이 3.01:1, red-600이 2.56:1이다. 키프레임을 오버레이와 공유하므로 펄스 깊이 조정은 UX-24에서 함께 다룬다.
- **심각도**: major · **영역**: 접근성 / 타이머 상태
- **관찰**: 5분 미만일 때 `text-amber-500`을 흰 배경에 쓰는데, 대비가 약 2.1:1로 큰 글자 기준 3:1에도 못 미친다. `pulse-urgent-slow`는 opacity를 0.7까지 낮추고(약 1.7:1), 1분 미만의 red-500에 붙는 `pulse-urgent-fast`는 opacity 0.5까지 낮춘다(약 2.1:1). 저장소 어디에도 `prefers-reduced-motion` 처리가 없다. 다크 모드의 amber-400은 문제없다.
- **이유**: 시청자가 시간을 보탤지 결정하는 가장 중요한 순간에 숫자가 가장 읽기 어려워진다. 5초 넘게 반복되는 깜빡임은 WCAG 2.2.2에도 해당한다.
- **권고**: 라이트 색만 `text-amber-700 dark:text-amber-400`, `text-red-600 dark:text-red-400`으로 바꾼다. `globals.css`에 `@media (prefers-reduced-motion: reduce)`로 긴급 펄스를 끄는 규칙을 추가한다. 펄스가 인라인 style이라 클래스로 옮기거나 `!important`가 필요하다. 오버레이의 펄스 제어는 UX-24에서 다룬다.
- **근거**: [17-timer-nonowner-urgent--d-light.png](ux-review/17-timer-nonowner-urgent--d-light.png), [17-timer-nonowner-urgent--m-light.png](ux-review/17-timer-nonowner-urgent--m-light.png) · `src/components/timer/CountdownDisplay.tsx:80-92`, `src/app/globals.css:98-106`

#### UX-09. 라이트 모드 상태·액션 배지와 증감량 텍스트가 AA 4.5:1에 미달한다
- **상태**: 해결 — `Badge` 라이트 배경을 green-700(4.94:1), red-600(4.76:1), cyan-700(5.28:1), amber-700(5.05:1)으로 올리고, 로그 변경량과 통계 랭킹 시간을 `text-green-700`으로 바꿨다. purple-600(5.53:1), blue-600(5.26:1), gray-500(4.84:1)은 점검 결과 통과라 그대로 두었다.
- **심각도**: major · **영역**: 접근성 / 일관성
- **관찰**: 12px 굵은 흰 글씨 배지의 대비가 bg-green-600에서 3.3:1(실행 중, 추가, 진행 중), bg-red-500에서 3.76:1(만료, 차감), cyan-600에서 3.68:1(활성화), amber-500에서 2.15:1(재시작)이다. 로그 '변경량' 열과 통계 랭킹의 `text-green-600`(12~14px)도 흰 배경에서 약 3.3:1이다. 다크 모드는 틴트 배경 패턴이라 모두 통과한다. 만료 화면에서는 큰 숫자가 회색이라, 상태를 텍스트로 알려 주는 요소가 사실상 이 작은 배지 하나다.
- **이유**: 상태와 증감은 가장 자주 확인하는 정보인데, 가장 작은 글씨에 대비까지 낮다. WCAG 1.4.3(AA) 미달이다.
- **권고**: `Badge.tsx`에서 라이트 배경만 한 단계 진하게 바꾼다(green-700, red-600, cyan-700, reopen은 amber-700). 증감 텍스트와 랭킹 시간은 `text-green-700`으로 바꾸고 `dark:` 클래스는 유지한다. purple-600, blue-600, gray-500(약 4.8:1)도 함께 점검한다. 같은 색이 다른 의미로 재사용되는 문제는 텍스트 라벨이 구분해 주므로 이번 범위에서 뺀다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [16-timer-expired--d-light.png](ux-review/16-timer-expired--d-light.png), [07-project-detail-running-owner--d-light.png](ux-review/07-project-detail-running-owner--d-light.png), [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/components/ui/Badge.tsx:10-22`, `src/app/timers/[id]/page.tsx:560, 604`, `src/components/stats/DonorRankingTable.tsx:46, 74`

### Minor

#### UX-10. 성공 토스트가 서버 응답 전에 뜨고, 실패하면 입력값이 사라진다
- **상태**: 해결 — 낙관적 카운트다운 갱신과 입력 즉시 초기화는 유지하고, 성공 토스트를 `res.ok` 확인 뒤로 옮겼다. 실패(`!res.ok`, 예외)하면 제출한 시·분·초를 복원한다. 요청 중에 다음 금액을 새로 입력했으면 그 값을 덮어쓰지 않는다.
- **심각도**: minor · **영역**: 타이머 조작
- **관찰**: `submitModify`는 요청을 보내기 전에 '추가 완료' 토스트를 띄우고 시, 분, 초를 0으로 초기화한다. 400 응답을 모의로 주면 초록 '추가 완료'와 빨간 '만료된 타이머입니다.'가 동시에 뜨고 입력칸은 0/0/0이 된다.
- **이유**: 서로 모순되는 토스트가 함께 뜨고, 다시 시도하려면 금액을 처음부터 다시 쳐야 한다. 카운트다운 롤백과 인라인 오류가 있어 실패 자체가 묻히지는 않는다.
- **권고**: 낙관적 카운트다운 갱신은 유지한다. 성공 토스트는 `res.ok` 확인 뒤로 옮기고, 실패나 catch 분기에서는 저장해 둔 시, 분, 초를 복원한다.
- **근거**: 측정 캡처 [B2-fail-after.png](ux-review/measure/B2-fail-after.png), [E1-m-500.png](ux-review/measure/E1-m-500.png) · `src/components/timer/TimerControls.tsx:109-115, 125-136`

#### UX-11. 삭제 실패에 아무 피드백이 없고, 링크와 URL 복사는 실패해도 성공 토스트가 뜬다
- **상태**: 해결 — 타이머·프로젝트 삭제 실패(`!res.ok`, 예외)에 오류 토스트를 띄운다. 타이머 삭제 설명을 '삭제하면 OBS 오버레이가 즉시 표시되지 않으며 되돌릴 수 없습니다.'로 바꿨다. 링크 복사(프로젝트, 타이머)와 오버레이 URL 복사는 `writeText`를 await한 뒤 성공 토스트를, 실패하면 오류 토스트를 띄운다.
- **심각도**: minor · **영역**: 프로젝트 상세 / 타이머 조작 / 오버레이
- **관찰**: 타이머와 프로젝트의 `handleDelete`는 `!res.ok`나 예외에서 `setDeleting(false)`만 호출한다. 타이머 삭제는 다이얼로그를 먼저 닫기 때문에 결과를 알 수 없다. 삭제 확인 문구는 '정말로 이 타이머를 삭제하시겠습니까?'뿐이고, OBS 오버레이가 즉시 404가 된다는 결과를 알리지 않는다. 링크 복사(프로젝트, 타이머)와 오버레이 URL 복사는 `navigator.clipboard.writeText`를 await하지 않고 바로 성공 토스트를 띄운다.
- **이유**: 실패를 성공으로 믿게 된다. 특히 오버레이 URL 복사가 실패하면 클립보드에 있던 이전 URL을 OBS에 붙여 넣게 된다.
- **권고**: 삭제 실패 분기에 `toast('… 삭제에 실패했습니다', 'error')`를 추가한다. 타이머 삭제 설명은 '삭제하면 OBS 오버레이가 즉시 표시되지 않으며 되돌릴 수 없습니다.'로 바꾼다. 복사는 `await` 후에 성공 토스트를 띄우고 catch에서 오류 토스트를 띄운다.
- **근거**: [13-timer-delete-confirm--d-light.png](ux-review/13-timer-delete-confirm--d-light.png) · `src/app/timers/[id]/page.tsx:298-311, 314, 704-712`, `src/app/projects/[id]/page.tsx:269-272, 320-333`, `src/components/timer/OverlaySettings.tsx:204-207`

#### UX-12. 키보드 프리셋이 서버 오류에 아무 반응이 없고, 안내 문구가 실제 조건과 다르다
- **상태**: 해결 — 기본 닉네임이 없을 때 안내를 '기본 닉네임을 설정하면 숫자키로 즉시 적용됩니다'로 바꾸고, `!res.ok`이면 서버 메시지(없으면 '시간 변경에 실패했습니다.')로 오류 토스트를 띄운다.
- **심각도**: minor · **영역**: 타이머 조작
- **관찰**: 단축키 프리셋은 localStorage의 기본 닉네임만 읽고, 입력란에 친 닉네임은 무시한다. 기본 닉네임이 없을 때 뜨는 안내는 '닉네임 입력 후 숫자키로 즉시 적용할 수 있습니다'인데, 실제로는 입력만으로는 동작하지 않는다. `!res.ok`일 때 else 분기가 없어 토스트가 뜨지 않는다.
- **이유**: 안내대로 했는데 같은 안내가 반복된다. 서버가 거절해도 적용되지 않았다는 신호가 없다.
- **권고**: 문구를 '기본 닉네임을 설정하면 숫자키로 즉시 적용됩니다'로 바꾸고, `!res.ok` 분기에 오류 토스트를 추가한다.
- **근거**: 측정 캡처 [D2-after-1.png](ux-review/measure/D2-after-1.png) · `src/app/timers/[id]/page.tsx:231-255`, `src/components/timer/TimerControls.tsx:62, 186`

#### UX-13. 만료 타이머에서 '추가'가 곧 재시작이라는 예고가 없다
- **상태**: 해결 — `status === "EXPIRED"`일 때 조작 패널 맨 위에 '만료된 타이머입니다. 시간을 추가하면 타이머가 다시 시작됩니다.' 한 줄을 넣었다. 하단 바와 단축키는 그대로 둔다. `TimerControls` 스토리에 `Expired`를 추가했다.
- **심각도**: minor · **영역**: 타이머 상태
- **관찰**: 만료 타이머의 조작 패널은 실행 중일 때와 똑같이 생겼다. 서버는 EXPIRED 상태에 ADD가 들어오면 REOPEN 로그를 남기고 RUNNING으로 되돌린다. `TimerControls`는 SCHEDULED만 분기한다.
- **이유**: 서브어톤이 끝난 뒤 화면을 정리하다 잘못 누르면 방송 화면의 오버레이가 다시 돈다. 재시작 자체는 의도된 기능이므로 문제는 예고가 없다는 점이다.
- **권고**: `status === 'EXPIRED'`일 때 패널 상단에 '만료된 타이머입니다. 시간을 추가하면 타이머가 다시 시작됩니다.' 한 줄을 넣는다. 하단 바와 단축키는 정당한 빠른 연장 경로이므로 그대로 둔다.
- **근거**: [16-timer-expired--d-light.png](ux-review/16-timer-expired--d-light.png), [16-timer-expired--m-light.png](ux-review/16-timer-expired--m-light.png) · `src/components/timer/TimerControls.tsx:196-206`, `src/lib/timer.ts:116-121`

#### UX-14. 만료 타이머에서 '차감'이 아무 효과 없이 '차감 완료'와 0→0 로그를 남긴다
- **상태**: 해결 — modify 라우트가 EXPIRED(또는 DB는 RUNNING이지만 잔여 0초) 상태의 SUBTRACT를 400 '만료된 타이머는 차감할 수 없습니다'로 거절하고 로그를 남기지 않는다. `modifyTimer`도 같은 조건에서 예외를 던진다. 클라이언트는 기존 롤백과 오류 토스트로 처리되고 '차감 완료' 토스트는 UX-10으로 응답 뒤로 옮겼다. 차감 세그먼트 비활성화(선택 사항)는 하지 않았다. `docs/API.md`, `docs/TIMER-LOGIC.md` 갱신.
- **심각도**: minor · **영역**: 타이머 상태
- **관찰**: EXPIRED 상태에서 SUBTRACT 요청을 보내면 상태 변화 없이 `before=0, after=0`인 SUBTRACT 로그가 INSERT된다. 클라이언트는 응답 전에 성공 토스트를 띄운다.
- **이유**: 공개 변경 기록에 실제로는 아무것도 바꾸지 않은 '-1시간' 항목이 시청자 닉네임과 함께 남는다.
- **권고**: `modifyTimer`나 modify 라우트에서 EXPIRED 상태의 SUBTRACT를 400('만료된 타이머는 차감할 수 없습니다')으로 거절한다. 그러면 기존 롤백과 오류 토스트가 그대로 동작한다. 차감 세그먼트를 비활성화하는 것은 선택 사항이다.
- **근거**: [16-timer-expired--d-light.png](ux-review/16-timer-expired--d-light.png) · `src/lib/timer.ts:126-139`, `src/components/timer/TimerControls.tsx:110`

#### UX-15. 모바일에서 같은 값의 프리셋 두 세트가 다르게 동작한다(누적과 즉시 적용)
- **상태**: 해결 — 하단 바 아래 줄에 `즉시 적용 → <닉네임>`을 항상 표시해 카드 프리셋(누적)과 달리 바로 적용됨을 알린다. 라벨(`+1h`)과 빠른 적용 모드 토글은 백로그(`UX-IMPROVEMENTS.md` 빠른 적용 모드 항목)와 충돌하지 않게 그대로 두었다. 이후 그 백로그대로 토글을 없앴다.
- **심각도**: minor · **영역**: 모바일 / 타이머 조작
- **관찰**: 카드 안의 '+1시간/+5시간/+10시간'은 입력값에 더하기만 하고, 하단 바의 '+1h/+5h/+10h'는 확인 없이 바로 적용된다. 생김새(회색 외곽선과 초록 채움)와 표기(시간과 h)는 다르지만, 동작의 차이를 설명하는 문구는 없다. 백로그의 '빠른 적용 모드 토글 제거'(`UX-IMPROVEMENTS.md`의 '기능 제거 제안')와 같은 인지 부하 문제다.
- **이유**: 하단 바로 금액을 맞추려고 여러 번 누르면 그때마다 바로 적용된다.
- **권고**: 하단 바 라벨을 '즉시 +1h'로 바꾸거나 바 위에 '즉시 적용' 캡션을 단다. 카드 프리셋은 조합 금액을 만드는 데 필요하므로 유지한다. 기존 백로그 항목과 함께 처리한다.
- **근거**: [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png) · 측정 캡처 [mob/timer-y400.png](ux-review/measure/mob/timer-y400.png) · `src/components/timer/TimerControls.tsx:19-29, 333-349, 411-429`

#### UX-16. 하단 즉시 적용 바가 누구 이름으로 기록될지 보여 주지 않는다
- **상태**: 해결 — 기존 안내문 자리에 하단 바가 기록할 닉네임(입력값, 비어 있으면 기본 닉네임)을 `즉시 적용 → 치즈냥`으로 항상 표시한다. 표시와 제출이 같은 `quickActor` 값을 쓴다. 닉네임이 없으면 기존 안내 `닉네임을 먼저 입력하세요`.
- **심각도**: minor · **영역**: 모바일
- **관찰**: 하단 바는 입력된 닉네임을 쓰고, 비어 있으면 기본 닉네임으로 즉시 적용한다. 적용한 뒤에도 닉네임은 그대로 남는다. 변경 기록을 보려고 스크롤하면 닉네임 입력란이 화면 밖으로 나가지만 바는 계속 활성 상태다.
- **이유**: 직전 후원자의 이름으로 다음 시간이 기록돼도 확인할 수 없다. 랭킹과 통계가 틀어진다.
- **권고**: 기존 안내문 자리(`:430-434`)에 현재 대상 닉네임을 한 줄로 항상 표시한다(예: '→ 치즈냥').
- **근거**: [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png) · 측정 캡처 [mob/timer-y1300.png](ux-review/measure/mob/timer-y1300.png) · `src/components/timer/TimerControls.tsx:109-116, 160, 411-435`

#### UX-17. 하단 바 높이 보정 여백이 카드 안에 들어가 있고, 페이지 끝의 푸터는 바에 가려진다
- **상태**: 해결 — 카드 안의 `h-20` 보정 div를 지웠다. 푸터가 `main` 밖에 있어 페이지 컨테이너 패딩으로는 푸터가 드러나지 않으므로, 권고와 달리 `globals.css`에서 md 미만일 때 `body:has([data-quick-bar])`에 바 높이(84px + max(12px, safe-area))만큼 하단 패딩을 준다. 바가 렌더될 때(소유자, SCHEDULED 아님)만 적용된다. 390px에서 끝까지 스크롤하면 푸터 하단 748px, 바 상단 749px.
- **심각도**: minor · **영역**: 모바일
- **관찰**: 보정용 `h-20` div가 '시간 조작' 카드 안에 있어서 확인 버튼 아래에 80px 빈 공간이 생긴다. 하단 바의 실제 높이는 약 95px인데 페이지 끝에는 여백이 없어, 끝까지 스크롤해도 푸터가 완전히 가려지고 그래프 카드 하단도 약 20px 겹친다.
- **이유**: 조작 영역이 불필요하게 길어지고, 그래프 하단과 연락처를 볼 수 없다.
- **권고**: `TimerControls.tsx:437`의 div를 지운다. 바가 렌더될 때(소유자이고 SCHEDULED가 아닐 때)만 페이지 컨테이너에 md 미만 하단 패딩(약 96px + safe-area)을 준다.
- **근거**: [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png) · 측정 캡처 [mob/timer-bottom.png](ux-review/measure/mob/timer-bottom.png) · `src/components/timer/TimerControls.tsx:411, 437`

#### UX-18. 최근 닉네임 칩(약 26px)과 '기본 닉네임으로 설정/해제'(약 16px)의 터치 영역이 너무 작다
- **상태**: 해결 — 기본 닉네임 설정/해제 버튼에 `min-h-11 px-2`(44px, 글자 정렬은 래퍼 `-ml-2`로 유지), 칩은 `py-2`와 간격 `gap-2`(높이 26→34px)로 키웠다.
- **심각도**: minor · **영역**: 접근성 / 모바일
- **관찰**: 칩은 `px-3 py-1 text-xs`에 간격 6px이다. 기본 닉네임 버튼은 패딩 없는 `text-xs` 텍스트 버튼이라 칩 바로 아래 약 6px 거리에 붙어 있다. 같은 폼의 프리셋은 48px이다. 프로젝트 규칙(`.claude/rules/ui.md`)은 터치 타겟 최소 44px을 요구한다.
- **이유**: 방송 중 후원자를 바꿀 때 가장 많이 누르는 컨트롤이다. 16px 높이는 WCAG 2.5.8 최소 기준(24px)에도 못 미친다.
- **권고**: 기본 닉네임 버튼에 `min-h-11 px-2`를 주고, 칩은 `py-2 gap-2`(약 32~36px) 정도로 키운다.
- **근거**: [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png), [24-timer-add-flow--m-light.png](ux-review/24-timer-add-flow--m-light.png) · `src/components/timer/TimerControls.tsx:220-263`

#### UX-19. `Button size="sm"`(32px)이 모바일의 로그아웃과 확인 다이얼로그 버튼에 그대로 쓰인다
- **상태**: 해결 — Button `sm`에 `max-md:min-h-11`을 더해 md 미만에서만 44px이다(데스크톱 32px 그대로). 로그아웃은 이 변경만으로 390px에서 48x44가 되어 별도 클래스를 주지 않았다(`cn`이 클래스 충돌을 병합하지 않아 `h-11`/`h-8` 덮어쓰기는 순서에 의존한다). 확인 다이얼로그 버튼 간격은 `max-md:gap-3`. 관찰에 함께 적힌 그래프 탭은 Button이 아니어서 같은 `max-md:min-h-11`을 직접 줬다. 페이지네이션·목표 버튼은 Button sm이라 함께 해결된다.
- **심각도**: minor · **영역**: 모바일 / 인증
- **관찰**: 측정값은 헤더 로그아웃 약 40~48x32(아바타와 테마 토글 바로 옆, 확인 없이 즉시 로그아웃), 삭제 확인 다이얼로그의 '취소'와 '삭제' 높이 32px에 간격 8px, 목표 취소와 삭제, 페이지네이션, 그래프 탭도 32px이다.
- **이유**: 프로젝트 규칙(44px) 위반이다. 방송 중 로그아웃을 잘못 누르면 OAuth를 다시 거치는 동안 시간 조작이 끊긴다.
- **권고**: Button sm 사이즈에 `max-md:min-h-11`을 추가해 모바일에서만 44px로 키운다. 로그아웃은 `h-11 w-11 sm:h-8 sm:w-auto`처럼 한다. 확인 다이얼로그 간격은 `gap-3`으로 늘린다.
- **근거**: [03-projects-mine--m-dark.png](ux-review/03-projects-mine--m-dark.png), [13-timer-delete-confirm--m-light.png](ux-review/13-timer-delete-confirm--m-light.png), [07-project-detail-running-owner--m-light.png](ux-review/07-project-detail-running-owner--m-light.png) · `src/components/ui/Button.tsx:20`, `src/components/layout/Header.tsx:32-35, 65-68`, `src/components/ui/ConfirmDialog.tsx:72-81`

#### UX-20. 오버레이 설정의 '저장'이 OBS 화면에 반영되지 않는데, 이를 알리는 안내가 없다
- **상태**: 해결 — 'OBS 브라우저 소스 URL' 라벨 아래에 권고 문구 한 줄을 넣고, 저장 성공 토스트에도 '저장되었습니다. OBS에 URL을 다시 붙여넣으세요'로 안내를 덧붙였다. 토스트 문구는 모바일(390px)에서 한 줄에 들어가도록 줄였다(긴 문구는 토스트가 화면 왼쪽 끝까지 붙는다). 이후 C069·C108에서 저장과 복사를 하단 'URL 복사' 버튼 하나로 합쳤다. URL 아래 문구는 'OBS 브라우저 소스에 붙여넣기 · 너비 1920 높이 1080'으로 바꾸고, 다시 붙여넣으라는 안내는 복사 토스트('URL을 복사했습니다. OBS에 붙여넣으세요')로 옮겼다.
- **심각도**: minor · **영역**: 오버레이
- **관찰**: 오버레이 페이지는 쿼리 파라미터만 읽고 저장된 설정은 읽지 않는다. 그래서 저장 후에도 OBS 소스의 URL을 새로 붙여 넣어야 방송에 반영된다. 모달은 '설정이 저장되었습니다'라고만 알린다. 실제로 12번 화면에서 저장된 설정은 96px에 제목 표시인데, 20번(파라미터 없는 기본 URL)은 72px에 제목이 없다.
- **이유**: 방송 중 색이나 위치를 바꾸고 '저장'을 누른 스트리머는 방송 화면이 바뀌기를 기대한다.
- **권고**: 'OBS 브라우저 소스 URL' 라벨 아래에 'URL을 바꿨다면 OBS 브라우저 소스에 새로 붙여넣어야 방송에 반영됩니다.' 한 줄을 넣는다. 저장 토스트에도 같은 안내를 덧붙인다.
- **근거**: [12-timer-overlay-settings--d-light.png](ux-review/12-timer-overlay-settings--d-light.png), [20-overlay--d-dark.png](ux-review/20-overlay--d-dark.png) · `src/app/timers/[id]/overlay/page.tsx:30-41, 77`, `src/components/timer/OverlaySettings.tsx:159-194`

#### UX-21. 오버레이 모달의 최종 목적인 URL 복사가 스크롤 아래에 있다
- **상태**: 해결 — URL·복사 블록을 스크롤 영역 맨 위(프리셋 위)로 옮겼다. 푸터는 그대로다. 이후 C069에서 복사 버튼을 하단 고정 주 버튼('URL 복사', 저장 포함)으로 옮겼다. 상단 URL은 확인용으로 남겼다.
- **심각도**: minor · **영역**: 오버레이
- **관찰**: 1440x900에서 복사 버튼이 보이는 영역보다 약 314px 아래에 있다(clientHeight 663, scrollHeight 1058). 고정 푸터에는 '저장'과 '변경 취소'만 있다.
- **이유**: 처음 쓰는 사람은 '저장'만 누르고 닫기 쉽다. UX-20과 겹쳐 URL이 OBS에 들어가지 않는다.
- **권고**: 'OBS 브라우저 소스 URL' 블록(`:489-501`)을 스크롤 영역 맨 위로 옮긴다. 푸터에 버튼을 더하지는 않는다.
- **근거**: [12-timer-overlay-settings--d-light.png](ux-review/12-timer-overlay-settings--d-light.png), [12-timer-overlay-settings--m-light.png](ux-review/12-timer-overlay-settings--m-light.png) · `src/components/timer/OverlaySettings.tsx:250, 468-544`

#### UX-22. 오버레이 미리보기가 고정 높이 200px에 실제 크기로 렌더되어 1080p 출력과 비율이 다르다
- **상태**: 해결(C063) — iframe을 1920x1080으로 그리고 `aspect-video` 상자 안에서 `transform: scale(상자폭/1920)`으로 줄인다. 상자 폭은 ResizeObserver로 잰다. 미리보기를 URL 바로 아래로 올리고, 세로 여유가 있는 데스크톱(폭 768px·높이 896px 이상)에서는 sticky로 붙였다. 200px·우하단 설정도 잘리지 않고 위치가 보인다.
- **심각도**: minor · **영역**: 오버레이
- **관찰**: 620x198 iframe이 축소 없이 1:1로 그린다. 96px이면 미리보기를 거의 다 채우지만 실제 1080p 화면에서는 높이의 약 9%다. 200px이면 숫자가 928px로 넘쳐 잘린다.
- **이유**: 크기와 위치를 고르는 유일한 도구가 비율을 왜곡한다.
- **권고**: iframe을 내부 1920x1080으로 두고 `aspect-video` 컨테이너 안에서 `transform: scale(containerWidth/1920)`을 적용한다. 컨테이너 폭은 ResizeObserver로 측정한다.
- **근거**: 측정 캡처 [modal-bottom-d-light.png](ux-review/measure/modal-bottom-d-light.png), [modal-font200.png](ux-review/measure/modal-font200.png) · `src/components/timer/OverlaySettings.tsx:469-487`

#### UX-23. 오버레이의 변화량 텍스트('+1:00:00')가 숫자 중심에서 반폭만큼 오른쪽으로 치우친다
- **상태**: 해결 — `overlay-float-up` 키프레임의 transform을 `translateY` 대신 `translate(-50%, 0)`에서 `translate(-50%, -60px)`로 움직이게 바꿔 가로 중앙 정렬을 유지한다. jsdom은 레이아웃을 계산하지 않아 자동 테스트는 두지 않았다. 이후 C061에서 변경량이 제목과 겹치고 위쪽 배치에서 잘리는 문제로 숫자 줄 옆에 붙이는 방식으로 바꿔, 가운데 정렬 transform은 없어졌다(`docs/UI.md` 5절 '변경 연출').
- **심각도**: minor · **영역**: 오버레이
- **관찰**: 인라인 `translateX(-50%)`를 `overlay-float-up` 키프레임의 `transform: translateY(...)`가 덮어쓴다. 실측 결과 중심이 69.6px(폭 139px의 절반) 어긋났다.
- **이유**: 시간이 추가될 때마다 시청자에게 보이는 텍스트가 어긋난 위치에 뜬다.
- **권고**: 키프레임을 `translate(-50%, 0)`에서 `translate(-50%, -60px)`로 바꿔 translateX를 포함시킨다.
- **근거**: `src/app/timers/[id]/overlay/page.tsx:244-256`, `src/app/globals.css:124-128`

#### UX-24. '시간 변경 애니메이션'을 꺼도 긴급과 만료 펄스는 계속 깜빡인다
- **상태**: 해결 — `animation=false`면 숫자의 긴급·만료 펄스와 '만료됨' 라벨 펄스를 끈다. 토글이 펄스까지 제어하므로 라벨에서 '시간 변경'을 빼 '애니메이션'으로 줄이고 `docs/API.md`의 `animation` 설명을 고쳤다. UX-08이 넘긴 펄스 깊이(최저 opacity) 조정은 §6에서 '기능 약화'로 기각된 제안이라 하지 않았고, 이 토글로 끌 수 있게 한 것으로 대신한다.
- **심각도**: minor · **영역**: 오버레이
- **관찰**: `animation` 옵션은 변경 감지에만 쓰인다. 만료 후 '00:00:00 만료됨'은 opacity 0.5로 끝없이 깜빡이고, 1분 미만에서는 0.8초 주기로 깜빡인다.
- **이유**: 방송 화면을 차분하게 두려고 애니메이션을 끈 스트리머가 깜빡임은 끌 수 없다. 긴급함은 색 변화로 이미 전달된다.
- **권고**: `animation`이 true일 때만 펄스를 적용한다(`page.tsx:223-233`). 펄스를 항상 켜 둘 생각이라면 토글 이름을 '시간 변경 효과'로 바꿔 범위를 분명히 한다.
- **근거**: [21-overlay-urgent--d-dark.png](ux-review/21-overlay-urgent--d-dark.png) · `src/app/timers/[id]/overlay/page.tsx:85, 223-233`, `src/app/globals.css:94-107`, `src/components/timer/OverlaySettings.tsx:457-465`

#### UX-25. 오버레이 모달의 hex 입력에 접근 가능한 이름이 없고, 위치 버튼에 선택 상태 속성이 없다
- **상태**: 해결 — hex 입력에 `aria-label`('텍스트 색상 코드', '배경색 코드'), 위치 버튼 5개에 `aria-pressed`를 추가했다.
- **심각도**: minor · **영역**: 접근성 / 오버레이
- **관찰**: 텍스트 색상과 배경색의 hex `<Input>`에 label과 aria-label이 없다. 위치 버튼 5개에는 aria-label은 있지만 `aria-pressed`가 없다('현재: …' 텍스트는 있다).
- **이유**: 스크린리더 사용자는 이름 없는 편집 필드 두 개를 구분할 수 없다(WCAG 4.1.2).
- **권고**: `aria-label="텍스트 색상 코드"`, `aria-label="배경색 코드"`와 `aria-pressed={config.position === …}`를 추가한다.
- **근거**: [12-timer-overlay-settings--d-light.png](ux-review/12-timer-overlay-settings--d-light.png) · `src/components/timer/OverlaySettings.tsx:336-341, 356-361, 380-433`

#### UX-26. 모든 차트의 축 눈금과 범례 글자가 opacity 0.4라 거의 읽히지 않는다
- **상태**: 해결 — 5개 차트 축에서 `opacity`를 없애고 눈금 글자를 `--color-muted-foreground`(라이트 4.89:1, 다크 7.11:1), 축선을 `--color-border`로 바꿨다. 범례 글자는 Recharts가 계열 색을 인라인으로 넣어 `wrapperStyle`이 닿지 않으므로 `labelStyle`로 본문색을 지정했다.
- **심각도**: minor · **영역**: 접근성 / 통계 / 타이머 조작
- **관찰**: XAxis와 YAxis에 `opacity={0.4}`가 걸려 11px 눈금까지 흐려진다. 대비는 약 1.6~2.5:1(라이트)이다. 통계 범례의 '추가'(초록 글자)는 약 2:1이다.
- **이유**: 툴팁은 hover나 탭이 필요하므로, 정적으로 값을 읽는 수단은 축뿐이다(WCAG 1.4.3).
- **권고**: 5개 차트에서 축 `opacity`를 제거한다. tick fill은 `var(--color-muted-foreground)`, axisLine과 tickLine stroke는 `var(--color-border)`로 둔다. 범례 글자는 본문색으로 바꾼다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/components/graph/RemainingChart.tsx:35-48`, `CumulativeChart.tsx:40-46`, `FrequencyChart.tsx:40-46`, `src/components/stats/HourlyActivityChart.tsx:44-52, 69-73`, `DailyActivityChart.tsx:51-58`

#### UX-27. 잔여·누적 그래프의 Y축 눈금이 정수 시간으로 반올림되어 중복되거나 틀린 라벨이 붙는다
- **상태**: 해결 — Y축 눈금을 `formatAxisSeconds`로 바꿨다. 축 최댓값이 2시간 미만이면 분, 아니면 시간 단위이고 소수 한 자리까지 쓴다(5.5h, 16.7m). 라벨이 길어진 만큼 축 폭을 40→44px로 늘렸다. 이후 눈금 자체를 정수 시간·분 간격(`durationAxisTicks`)으로 바꾸고 라벨을 `4시간`·`30분`으로 고쳤다(축 폭 52px). 소수 눈금(16.7h)이 바로 읽히지 않았기 때문이다.
- **심각도**: minor · **영역**: 타이머 상태 / 모바일
- **관찰**: `${(v/3600).toFixed(0)}h` 때문에 15번 화면은 '3h, 3h, 2h, 1h, 0h', 16번은 '2h, 2h, 1h, 1h, 0h', 17번은 '1h, 1h, 1h, 0h, 0h'로 나온다. 11번의 '6h, 17h' 눈금은 실제로는 5.5h, 16.5h다.
- **이유**: 잔여 시간이 짧은 만료 임박 타이머일수록 축이 의미를 잃는다.
- **권고**: `toFixed(1)`을 쓰거나, 최댓값이 2시간 미만이면 `${Math.round(v/60)}m`로 분 단위를 쓴다. `allowDecimals`는 초 단위 tick에 효과가 없다.
- **근거**: [15-timer-scheduled--d-light.png](ux-review/15-timer-scheduled--d-light.png), [16-timer-expired--d-light.png](ux-review/16-timer-expired--d-light.png), [17-timer-nonowner-urgent--m-light.png](ux-review/17-timer-nonowner-urgent--m-light.png) · `src/components/graph/RemainingChart.tsx:42`, `src/components/graph/CumulativeChart.tsx:43`

#### UX-28. 라이트 accent 위 흰 글씨(4.47:1)와 muted 위 muted 글씨(4.35:1)가 AA에 조금 못 미친다
- **상태**: 해결 — 라이트 토큰만 `--accent` `#4f46e5`, `--accent-hover` `#4338ca`, `--muted-foreground` `#6b6b6b`로 바꿨다. 흰 글씨/accent 6.29:1, muted/muted 4.89:1이다. 다크 토큰은 그대로다.
- **심각도**: minor · **영역**: 접근성 / 일관성
- **관찰**: 해당하는 곳은 primary 버튼('새 프로젝트', '새 목표'), 선택된 그래프 모드, 선택되지 않은 그래프 모드와 '차감' 토글이다.
- **이유**: 가장 많이 쓰는 버튼과 추가/차감 선택의 글자가 4.5:1에 미달한다.
- **권고**: 라이트 토큰만 바꾼다. `--accent`를 `#4f46e5`, `--accent-hover`를 `#4338ca`, `--muted-foreground`를 `#6b6b6b` 정도로 조정한다.
- **근거**: [03-projects-mine--d-light.png](ux-review/03-projects-mine--d-light.png), [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png) · `src/app/globals.css:8-13`, `src/components/graph/GraphModeSelector.tsx:20, 33`

#### UX-29. 모바일에서 한국어 제목과 설명이 음절 단위로 끊긴다
- **상태**: 해결 — EditableText의 h1·p(편집 가능/불가 두 경로 모두)에만 `break-keep [overflow-wrap:anywhere]`를 줬다. 전역 적용과 레이아웃 재배치는 하지 않았다.
- **심각도**: minor · **영역**: 모바일 / 프로젝트 상세 / 타이머
- **관찰**: 오른쪽 배지와 아이콘 그룹이 `shrink-0`이라 제목 칼럼이 좁아진다. '합방 타이 / 머', '서브어톤 / 메인 타이 / 머', '24시간 서브어 / 톤 마라톤', '타이머 없는 프로젝 / 트', '시작 예 / 정'처럼 끊긴다. 저장소 어디에도 `keep-all`이 없다.
- **이유**: 대상을 식별하는 첫 요소가 깨져 보이고 읽기 어렵다.
- **권고**: 제목과 설명(EditableText의 h1과 p)에만 `break-keep [overflow-wrap:anywhere]`를 준다. 전역 적용이나 레이아웃 재배치는 하지 않는다.
- **근거**: [15-timer-scheduled--m-light.png](ux-review/15-timer-scheduled--m-light.png), [11-timer-running-owner--m-light.png](ux-review/11-timer-running-owner--m-light.png), [08-project-detail-no-timer--m-light.png](ux-review/08-project-detail-no-timer--m-light.png), [09-project-detail-scheduled--m-light.png](ux-review/09-project-detail-scheduled--m-light.png) · `src/app/timers/[id]/page.tsx:375-398`, `src/app/projects/[id]/page.tsx:338-361`, `src/components/ui/EditableText.tsx:120-138`

#### UX-30. 모바일 프로젝트 상세의 '실행 중' 배지가 두 줄로 깨진다
- **상태**: 해결 — `Badge` 기본 클래스에 `whitespace-nowrap`을 추가했다. 390px 프로젝트 상세에서 배지 높이 36→20px(한 줄).
- **심각도**: minor · **영역**: 모바일 / 프로젝트 상세
- **관찰**: text-5xl 카운트다운 옆의 배지가 '실행 / 중'이 된다. Badge에 `whitespace-nowrap`이 없다.
- **이유**: 상태 신호가 레이아웃 버그처럼 보인다.
- **권고**: `Badge.tsx` 기본 클래스에 `whitespace-nowrap`을 추가한다. 390px 폭 계산상 넘치지 않는다.
- **근거**: [07-project-detail-running-owner--m-light.png](ux-review/07-project-detail-running-owner--m-light.png), [10-project-detail-nonowner--m-light.png](ux-review/10-project-detail-nonowner--m-light.png) · `src/components/ui/Badge.tsx:25-27`, `src/app/projects/[id]/page.tsx:423-433`

#### UX-31. 소유자 화면의 h1에 `role="button"`이 붙어 heading 의미가 사라진다
- **상태**: 해결 — h1/p에서 role, tabIndex, aria-label, onKeyDown을 빼고 onClick만 남겼다. 편집 버튼 이름은 prop 없이 태그로 구분해 '제목 편집'(h1), '설명 편집'(p)이다(호출부 4곳 모두 이 구분과 맞는다).
- **심각도**: minor · **영역**: 접근성
- **관찰**: 편집 가능 상태에서 `<h1 role="button" aria-label="… — 클릭하여 편집">`로 렌더된다. 그래서 소유자 페이지에는 접근성 트리상 h1이 없다. 옆에 '편집' 버튼이 따로 있어 탭 순서에도 두 번 들어가고, 제목과 설명 버튼 이름이 둘 다 '편집'이다.
- **이유**: 스크린리더의 heading 탐색으로 페이지 제목을 찾을 수 없다(WCAG 1.3.1).
- **권고**: Tag에서 role, tabIndex, aria-label, onKeyDown을 뺀다. onClick은 마우스 편의를 위해 남긴다. 편집 버튼의 aria-label은 '제목 편집', '설명 편집'처럼 prop으로 구분한다.
- **근거**: [07-project-detail-running-owner--d-light.png](ux-review/07-project-detail-running-owner--d-light.png), [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png) · `src/components/ui/EditableText.tsx:121-138`

#### UX-32. 편집 연필 아이콘이 hover나 focus 때만 보여 터치 기기에서는 편집 가능 여부를 알 수 없다
- **상태**: 해결 — 편집 버튼에 `[@media(hover:none)]:opacity-100`을 더했다.
- **심각도**: minor · **영역**: 프로젝트 상세
- **관찰**: 아이콘이 `opacity-0 group-hover:opacity-100`이라 모바일 캡처의 제목과 설명 옆에 편집 단서가 없다.
- **이유**: 소유자가 이름과 설명을 고칠 수 있다는 것을 발견하기 어렵다.
- **권고**: `[@media(hover:none)]:opacity-100` 클래스를 하나 추가한다.
- **근거**: [07-project-detail-running-owner--m-light.png](ux-review/07-project-detail-running-owner--m-light.png), [08-project-detail-no-timer--m-light.png](ux-review/08-project-detail-no-timer--m-light.png) · `src/components/ui/EditableText.tsx:131-138`

#### UX-33. 모바일에서 프로젝트 이름을 편집하면 저장(✓) 버튼이 삭제 아이콘 밑에 깔린다
- **상태**: 해결 — 편집 행 래퍼에 `min-w-0`, input에 `min-w-0 w-full`을 줬다. 390px에서 ✓ 중심의 `elementFromPoint`가 '저장'이고 가로 스크롤이 없다(scrollWidth 395→390).
- **심각도**: minor · **영역**: 프로젝트 상세 / 모바일
- **관찰**: 390px에서 편집 input이 intrinsic 폭만큼 늘어나 ✓가 프로젝트 삭제 버튼 아래로 들어간다(`elementFromPoint`로 확인하면 '프로젝트 삭제'가 잡힌다). ✕는 뷰포트 밖으로 나가 가로 스크롤이 생긴다. 삭제는 확인 창을 거치고 blur로 저장되므로 데이터 손실은 없다.
- **이유**: 저장하려던 손가락 앞에 삭제 확인창이 뜨고, 취소 버튼에는 닿을 수 없다.
- **권고**: EditableText 편집 행의 input에 `min-w-0 w-full`, 래퍼 div에 `min-w-0`을 준다.
- **근거**: [07-project-detail-running-owner--m-light.png](ux-review/07-project-detail-running-owner--m-light.png) · 측정 캡처 [pd-title-tap--m.png](ux-review/measure/pd-title-tap--m.png) · `src/components/ui/EditableText.tsx:79-94`, `src/app/projects/[id]/page.tsx:338-361`

#### UX-34. 프로젝트 상세의 RUNNING 타이머 카드가 서버와 동기화되지 않고, 0이 되어도 '실행 중'으로 남는다
- **상태**: 해결 — 직접 만든 `setInterval`(SCHEDULED 전용, 탭이 숨겨져도 계속 돎)을 P0-1의 `usePolling`으로 바꾸고 조건을 `SCHEDULED || RUNNING`으로 넓혔다(5초, 화면이 숨겨지면 중단). 카운트다운이 0에 닿으면 `useCountdownEnded` 훅이 다음 폴링을 기다리지 않고 배지를 '만료'로 바꾼다. 서버 기록은 목록 API의 lazy 만료 감지가 다음 폴링 때 남긴다.
- **심각도**: minor · **영역**: 프로젝트 상세
- **관찰**: 폴링은 SCHEDULED일 때만 돈다. RUNNING 카드는 처음 받은 값을 클라이언트에서 깎기만 하므로 다른 곳에서 추가한 시간이 반영되지 않는다. 0이 되면 숫자는 회색 00:00:00이 되지만 배지는 `timers[0].status` 그대로 '실행 중'이다. 백로그 P0-1은 같은 문제를 타이머 상세에서만 해결했다.
- **이유**: 시청자가 끝나지 않은 타이머를 끝났다고 보거나, 끝난 타이머를 실행 중으로 본다.
- **권고**: 폴링 조건을 `SCHEDULED || RUNNING`으로 넓힌다(5초 간격, 화면이 숨겨지면 중단). 표시 잔여가 0이면 배지를 '만료'로 보이게 한다.
- **근거**: [10-project-detail-nonowner--d-light.png](ux-review/10-project-detail-nonowner--d-light.png) · `src/app/projects/[id]/page.tsx:254-259, 431-433`, `src/components/timer/CountdownDisplay.tsx:39-59`

#### UX-35. 타이머 상세의 폴링이 잔여 시간과 상태만 갱신해서, 다른 기기의 변경 기록과 만료 로그가 나타나지 않는다
- **상태**: 해결 — 폴링 결과가 상태 전이이거나, 마지막 반영 값에서 흐른 시간을 뺀 기대값과 3초 이상 다를 때만(`hasExternalChange`, `src/lib/timer-sync.ts`) 현재 필터 그대로 로그(1페이지를 보고 있을 때만)와 그래프를 다시 불러온다. 폴링 주기(RUNNING 5초, 그 외 15초)와 탭 비활성 시 중단은 그대로다.
- **심각도**: minor · **영역**: 타이머 상태
- **관찰**: `pollTimer`는 `setTimer`만 호출한다. 로그와 그래프는 초기 로드, 필터 변경, 이 탭에서 직접 수정했을 때만 다시 불러온다. 휴대폰 하단 바로 추가하면 데스크톱의 카운트다운은 바뀌지만 기록은 그대로다.
- **이유**: 숫자가 왜 바뀌었는지 화면에서 확인할 수 없다.
- **권고**: 상태가 바뀌었거나, 로컬 카운트다운으로 계산한 기대값과 서버 값의 차이가 다른 사람의 조작으로 볼 만큼 클 때만 현재 페이지와 필터 그대로 로그와 그래프를 다시 불러온다. 사용자가 2페이지 이후를 보고 있으면 건너뛴다.
- **근거**: [17-timer-nonowner-urgent--d-light.png](ux-review/17-timer-nonowner-urgent--d-light.png), [18-timer-loggedout-viewer--d-light.png](ux-review/18-timer-loggedout-viewer--d-light.png) · `src/app/timers/[id]/page.tsx:104-127, 216-228`

#### UX-36. 일시적인 서버 오류도 '찾을 수 없습니다'로 표시되고, 404에는 쓸모없는 '다시 시도'만 있다
- **상태**: 해결 — 프로젝트·타이머 상세가 `res.status`로 분기한다. 404이면 '…를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다.'만 보여 주고 `onRetry`를 넘기지 않는다. 그 밖의 상태와 네트워크 오류는 '…를 불러오지 못했습니다'와 '다시 시도'를 보여 준다. ErrorState는 바꾸지 않았고, 통계 페이지는 권고 범위 밖이라 그대로 두었다.
- **심각도**: minor · **영역**: 일관성 / 오류 처리
- **관찰**: 프로젝트와 타이머 상세는 404, 403, 5xx, 네트워크 오류를 모두 '…를 찾을 수 없습니다'와 '다시 시도'로 표시한다. 통계 페이지는 구체적인 메시지가 있을 때 재시도를 숨겨서, 세 화면의 오류 처리가 다르다. 헤더 로고가 `/`를 거쳐 `/projects`로 이어지므로 막다른 길은 아니다.
- **이유**: 일시적인 장애 때 스트리머가 타이머가 삭제됐다고 오해할 수 있다.
- **권고**: `res.status`로 분기한다. 404이면 '찾을 수 없습니다(삭제되었거나 주소가 잘못됨)'를 보여 주고 `onRetry`를 넘기지 않는다. 그 밖의 오류는 '불러오지 못했습니다'와 '다시 시도'로 표시한다. ErrorState에 새 슬롯은 만들지 않는다.
- **근거**: [22-project-notfound--d-light.png](ux-review/22-project-notfound--d-light.png), [22-project-notfound--m-light.png](ux-review/22-project-notfound--m-light.png), [23-timer-notfound--d-light.png](ux-review/23-timer-notfound--d-light.png) · `src/app/projects/[id]/page.tsx:200-209, 302-309`, `src/app/timers/[id]/page.tsx:142-146, 350-356`, `src/app/timers/[id]/stats/page.tsx:73-75`

#### UX-37. 프로젝트 카드에 타이머 유무나 상태가 없어 진행 중인 타이머를 목록에서 고를 수 없다
- **상태**: 해결 — 최소안. 이미 내려오는 `timerCount`가 0이면 카드 메타 줄에 '타이머 없음'을 표시한다. 상태 배지(목록 API 변경)는 하지 않았다. `docs/UI.md:8`도 실제 표시에 맞게 고쳤다.
- **심각도**: minor · **영역**: 인증·프로젝트 목록 / 모바일
- **관찰**: 4개 카드(타이머 없음, 예약, 실행, 만료)가 시각적으로 똑같다. API의 `ProjectListItem.timerCount`는 카드에서 쓰지 않는다. `docs/UI.md:8`은 카드가 '타이머 수'를 보여 준다고 적고 있어 코드와 어긋난다.
- **이유**: 방송 중 타이머로 급히 돌아가려면 이름을 기억하거나 카드를 하나씩 열어 봐야 한다.
- **권고**: 최소안은 이미 내려오는 `timerCount`로 '타이머 없음'만 표시하는 것이다. 상태 배지를 보이려면 목록 API에 상태 필드를 하나 추가해야 하므로 별도 판단이 필요하다. 어느 쪽이든 `docs/UI.md:8`은 고친다.
- **근거**: [03-projects-mine--d-light.png](ux-review/03-projects-mine--d-light.png), [02-projects-loggedout--d-light.png](ux-review/02-projects-loggedout--d-light.png) · `src/components/project/ProjectCard.tsx:12-33`, `src/types/index.ts:126-133`, `docs/UI.md:8`

#### UX-38. `cn()`이 단순 문자열 결합이라 아이콘 크기 지정(`w-4 h-4`)이 무시되고, 검색 아이콘이 플레이스홀더에 붙는다
- **상태**: 해결 — 의존성 없이 Icons.tsx의 `iconClass()`가 className에 접두사 없는 `w-`/`h-`/`size-`가 있으면 그 축의 기본값(w-6, h-6)을 붙이지 않는다. `cn`의 전역 동작은 그대로다(`sm:w-5`만 있으면 기본값을 유지).
- **심각도**: minor · **영역**: 인증·프로젝트 목록 / 전역
- **관찰**: 아이콘 기본값 `w-6 h-6`과 넘겨준 `w-4 h-4`가 함께 붙고, CSS 순서상 w-6가 이긴다. 그래서 검색 아이콘이 24px이 되어 `pl-9` 입력의 텍스트 시작점과 맞닿는다. h-8 버튼 안의 + 아이콘도 24px이다.
- **이유**: 코드가 의도한 크기와 실제 렌더가 다르고, 이 문제가 아이콘을 쓰는 모든 곳에 퍼져 있다.
- **권고**: `cn`을 `twMerge(clsx(...))`로 바꾼다. 의존성을 추가하지 않으려면 Icons.tsx에서 className에 w-나 h-가 있을 때 iconBase를 생략한다.
- **근거**: [03-projects-mine--d-light.png](ux-review/03-projects-mine--d-light.png), [03-projects-mine--m-dark.png](ux-review/03-projects-mine--m-dark.png), [06-projects-empty-newuser--m-light.png](ux-review/06-projects-empty-newuser--m-light.png) · `src/lib/utils.ts:1-3`, `src/components/ui/Icons.tsx:7, 113`, `src/app/projects/page.tsx:160, 228, 235`

#### UX-39. 프로젝트 탭을 화살표 키로 바꾸면 선택만 이동하고 포커스는 이전 탭(tabIndex=-1)에 남는다
- **상태**: 해결 — 두 탭의 키 핸들러를 하나로 합치고 새 탭에 `focus()`를 호출한다. 프로젝트 상세의 목표 탭(`src/app/projects/[id]/page.tsx`)에도 같은 패턴이 있으나 이 지적의 범위 밖이라 두었다.
- **심각도**: minor · **영역**: 접근성
- **관찰**: onKeyDown은 `setActiveTab`만 호출하고 `focus()`를 옮기지 않는다.
- **이유**: WAI-ARIA Tabs 패턴과 다르게 포커스와 선택이 갈라진다.
- **권고**: 키 핸들러에서 새 탭 요소에 `.focus()`를 호출한다.
- **근거**: `src/app/projects/page.tsx:185-192, 206-213`

#### UX-40. 목표 취소 확인창에 '취소'와 '취소하기' 버튼이 나란히 있다
- **상태**: 해결 — 확인 라벨을 '목표 취소'로 바꾸고, 빠져나가는 버튼은 모든 확인창의 기본값 '돌아가기'로 올렸다(W27).
- **심각도**: minor · **영역**: 일관성 / 프로젝트 상세
- **관찰**: `confirmLabel="취소하기"`만 넘기고 cancelLabel은 기본값 '취소'를 쓴다. 확인 창 문구는 '취소된 목표는 다시 활성화할 수 없습니다'라고 경고한다.
- **이유**: 물러서려는 사람이 되돌릴 수 없는 버튼을 누를 수 있다. 버튼 색(danger)이 달라서 위험은 중간 정도다.
- **권고**: 이 다이얼로그에만 `cancelLabel="돌아가기"`를 넘긴다. 필요하면 확인 라벨을 '목표 취소하기'로 바꾼다.
- **근거**: [07-project-detail-running-owner--d-light.png](ux-review/07-project-detail-running-owner--d-light.png) · `src/components/goal/GoalCard.tsx:184-192`, `src/components/ui/ConfirmDialog.tsx:21-22`

#### UX-41. 목표 탭 '완료'에 실패하거나 취소된 목표도 들어 있다
- **상태**: 해결 — 탭 이름을 '종료', 빈 상태를 '종료된 목표가 없습니다.'로 바꿨다. 내부 식별자(`completed`)와 '액션'→'유형' 같은 선택 용어 통일은 그대로다.
- **심각도**: minor · **영역**: 일관성(카피)
- **관찰**: '완료' 탭은 `inactiveGoals`(달성, 실패, 취소)를 보여 주는데, 배지는 '달성', '실패', '취소'라고 쓴다.
- **이유**: '완료'라는 이름이 실패한 목표까지 성공한 것처럼 묶는다.
- **권고**: 탭 이름을 '종료'로, 빈 상태 문구를 '종료된 목표가 없습니다'로 바꾼다. '액션'을 '유형'으로 바꾸는 등의 나머지 용어 통일은 선택 사항이다.
- **근거**: [07-project-detail-running-owner--d-light.png](ux-review/07-project-detail-running-owner--d-light.png) · `src/app/projects/[id]/page.tsx:122, 172`, `src/components/goal/GoalCard.tsx:20-25`

#### UX-42. 모든 페이지의 브라우저 탭 제목이 '삼루먼타이머'로 같다
- **상태**: 해결 — 데이터를 불러온 뒤 `useDocumentTitle` 훅이 '<타이머 제목> · 삼루먼타이머', '<제목> 통계 · 삼루먼타이머', 'OBS 오버레이 · <제목>', '<프로젝트 이름> · 삼루먼타이머'로 바꾼다. 클라이언트 이동 때 루트 metadata가 다시 적용되지 않으므로 언마운트하면 이전 제목으로 되돌린다.
- **심각도**: minor · **영역**: 정보구조
- **관찰**: metadata가 루트 레이아웃에만 정적으로 있고, 페이지별 `document.title`이나 `generateMetadata`가 없다.
- **이유**: 조작 탭, 통계 탭, 오버레이 탭을 동시에 열어 둔 스트리머가 탭을 구분할 수 없다.
- **권고**: 데이터를 불러온 뒤 useEffect에서 `document.title = \`${timer.title} · 삼루먼타이머\``로 설정한다. 오버레이는 'OBS 오버레이 · 제목'으로 한다.
- **근거**: [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png), [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/app/layout.tsx:20-23`

#### UX-43. 예약 타이머를 조기 시작하거나 시작 시각을 바꿀 방법이 없다
- **상태**: 해결 — 조기 시작. 예약 카드에 '지금 시작' 버튼(`POST /api/timers/[id]/activate`, 수동 `ACTIVATE`)을 두고 안내를 '시작 시각까지 기다리거나 지금 시작할 수 있습니다.'로 바꿨다(2026-10 UX 백로그 C031). 시작 시각 변경은 아직 없고 늦추려면 삭제 후 재생성한다.
- **심각도**: minor · **영역**: 타이머 상태
- **관찰**: SCHEDULED 패널에는 안내 문구만 있다. PATCH는 title과 description만 받는다. 남은 수단은 삭제 후 재생성이다. 예약 타이머에는 로그가 없어 잃는 데이터는 없다.
- **이유**: 방송이 일찍 시작되면 폼을 다시 채워야 한다.
- **권고**: 최소안은 안내 문구에 '일정을 바꾸려면 삭제 후 다시 만드세요'를 덧붙이는 것이다. 실제 수요가 확인되면 기존 ACTIVATE 전이를 재사용하는 '지금 시작'을 검토한다.
- **근거**: [15-timer-scheduled--d-light.png](ux-review/15-timer-scheduled--d-light.png) · `src/components/timer/TimerControls.tsx:191-204`, `src/app/api/timers/[id]/route.ts:134-160`

### Nit

| ID | 제목 · 영역 | 관찰과 이유 | 최소 권고 | 근거 |
|---|---|---|---|---|
| ✅ UX-44 | 탭 `aria-controls`가 없는 id를 가리킨다 · 접근성 | `project-tabpanel` 요소가 없고 `role=tabpanel`도 없다. 대부분의 스크린리더가 무시하지만 ARIA 구조가 불완전하다. | 목록 영역(`:249-292`)을 `role="tabpanel" id="project-tabpanel"`로 감싸거나 aria-controls를 제거한다. **해결**: 로그인 시 목록 영역을 `role=tabpanel id=project-tabpanel`로 감쌌다. | [03-projects-mine--d-light.png](ux-review/03-projects-mine--d-light.png) · `src/app/projects/page.tsx:184, 205` |
| ✅ UX-45 | 로그인과 콜백 페이지가 레이아웃 안에서 다시 `min-h-screen`을 쓴다 · 반응형 | scrollHeight가 1098(뷰포트 900)이라 버튼 하나뿐인 화면이 스크롤된다. | `min-h-[60vh]` 정도로 줄인다. main이 flex가 아니므로 `flex-1`은 효과가 없다. 헤더의 로그인 링크는 그대로 둔다. **해결**: 로그인·콜백 모두 `min-h-[60vh]`. | [01-login--d-light.png](ux-review/01-login--d-light.png), [01-login--m-dark.png](ux-review/01-login--m-dark.png) · `src/app/(auth)/login/page.tsx:39`, `callback/page.tsx:16` |
| ✅ UX-46 | 프로젝트가 0개인 신규 유저에게 검색창과 정렬이 보인다 · 정보구조 | 검색할 대상이 없는데 컨트롤이 첫 화면 위쪽을 차지한다. | `activeTab==="mine" && mineTotal===0 && !searchQuery`일 때만 숨긴다. 중복 CTA는 그대로 둔다. **해결**: 탭 숫자(`mineTotal`)는 검색 결과 수로 덮어써져 검색어를 지울 때 입력칸이 사라질 수 있어, 검색어와 무관한 내 프로젝트 수가 0이고 검색어가 없을 때만 숨긴다(로그인 시). | [06-projects-empty-newuser--m-light.png](ux-review/06-projects-empty-newuser--m-light.png) · `src/app/projects/page.tsx:225-247` |
| ✅ UX-47 | '새 프로젝트' 폼을 열어도 이름 입력칸에 포커스가 가지 않는다 · 피드백 | 포커스가 토글 버튼에 남아 한 번 더 클릭해야 한다. | 이름 Input에 `autoFocus`를 준다. Input이 prop을 전달하는지 확인한다. **해결**: 이름 Input에 `autoFocus`(Input이 props를 전달함을 확인). | [04-projects-create-form--d-light.png](ux-review/04-projects-create-form--d-light.png) · `src/components/project/CreateProjectForm.tsx:56-63` |
| ✅ UX-48 | 프로젝트 상세의 타이머 카드에 이동 단서가 없다 · 정보구조 | 시간 조작 화면으로 가는 유일한 링크인데 터치 기기에서는 hover 단서도 없다. 카드가 크고 강조되어 있어 영향은 작다. | 오른쪽에 셰브런이나 '시간 조절 ›'을 짧게 붙인다. **해결**: 배지 오른쪽에 셰브런만 붙였다. 비소유자도 보는 카드라 '시간 조절' 문구는 쓰지 않았다. | [07-project-detail-running-owner--m-light.png](ux-review/07-project-detail-running-owner--m-light.png) · `src/app/projects/[id]/page.tsx:419-438` |
| ✅ UX-49 | 경과 시간 '(72:00:53 경과)'가 시계 형식이다 · 카피 | 큰 카운트다운과 같은 HH:MM:SS 형식이라 시각처럼 읽힌다. 100시간을 넘으면 '120:03:09'가 된다. | 날짜는 유지하고 경과만 '72시간 2분 경과'처럼 단위를 붙인다(`formatSeconds` 재사용). **해결**: `formatSeconds`는 타이머 페이지 지역 함수라, 예시('72시간 2분')와 같은 형식인 `utils.formatDuration`을 썼다. 1분 미만은 생략한다. 이후 경과 표시 자체를 없앴다(생성 시각 기준이라 다시 시작한 타이머에서 실제 진행 시간과 어긋남). | [18-timer-loggedout-viewer--d-light.png](ux-review/18-timer-loggedout-viewer--d-light.png), [17-timer-nonowner-urgent--d-light.png](ux-review/17-timer-nonowner-urgent--d-light.png) · `src/components/timer/CountdownDisplay.tsx:63-70` |
| ✅ UX-50 | 타이머가 없을 때 목표 영역이 비활성 버튼과 빈 탭(0/0)을 보여 준다 · 단순화 | 첫 타이머를 만들기 전에 눌러도 반응하지 않는 요소가 화면을 차지한다. | `timers.length > 0`일 때만 GoalSection을 렌더한다. 새 UI는 추가하지 않는다. **해결**: 타이머를 삭제한 프로젝트의 목표 기록이 사라지지 않도록 `timers.length > 0 || goals.length > 0`일 때 렌더한다. | [08-project-detail-no-timer--d-light.png](ux-review/08-project-detail-no-timer--d-light.png) · `src/app/projects/[id]/page.tsx:60-176, 452-461` |
| ✅ UX-51 | 타이머 생성 폼의 제목에 필수 표시가 없다 · 피드백 | 제목이 비어 있으면 제출이 비활성인데 이유가 나오지 않는다. 초기 시간 0:0:0은 제출 시점에야 오류가 난다. | '타이머 제목' 라벨에 '(필수)'를 붙인다. 비활성 버튼은 유지한다. **해결**: 라벨을 '타이머 제목 (필수)'로. | `src/components/timer/CreateTimerForm.tsx:189-193, 245-252, 418` |
| ✅ UX-52 | 모바일 생성 다이얼로그에 가장자리 여백이 없고 날짜 select가 줄바꿈된다 · 다이얼로그 | `w-full max-w-md`라 화면 가장자리에 붙는다. '일' select가 둘째 줄로 떨어진다. | `max-w-[min(28rem,calc(100%-2rem))]`로 바꾸고 날짜 select 폭을 줄인다. sticky 푸터는 만들지 않는다. **해결**: FormDialog 폭을 권고대로 바꾸고 날짜 select 기본 폭을 `w-14`(연도는 `w-20`)로 줄였다. | `src/components/ui/FormDialog.tsx:52, 68`, `src/components/timer/CreateTimerForm.tsx:333-358` |
| UX-53 | 타이머 조작 화면에 목표 진행이 없다 · 정보구조 | 목표는 프로젝트 상세에서만 보이지만, 브레드크럼으로 한 번에 갈 수 있다. | 변경하지 않거나, 읽기 전용 한 줄('목표 2/3 달성 · 프로젝트에서 보기')만 둔다. **보류**: 권고의 첫 안(변경하지 않음)을 따른다. 브레드크럼(이제 프로젝트 이름)으로 한 번에 목표를 볼 수 있고, 읽기 전용 한 줄은 목표 API 호출이 추가되는 새 기능이다. **이후 해결**: 프로젝트 화면을 조작 콘솔로 통합해 시간 조작 옆에 목표를 둔다. | [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png) · `src/app/timers/[id]/page.tsx:362-713` |
| ✅ UX-54 | 만료 상태의 큰 카운트다운 아래에 서브텍스트가 없다 · 일관성 | 예약과 실행 상태에는 서브텍스트가 있는데 만료만 회색 00:00:00뿐이다. 배지와 로그가 상태를 알려 주기는 한다. | `size==="large" && isExpired`일 때 정적인 '만료됨' 한 줄을 넣는다. **해결**: large + 만료일 때 '만료됨' 한 줄. | [16-timer-expired--d-light.png](ux-review/16-timer-expired--d-light.png) · `src/components/timer/CountdownDisplay.tsx:113-123` |
| ✅ UX-55 | 오버레이 색 입력값을 검증하지 않는다 · 오류 처리 | 입력 중간 상태(`#ff`)가 그대로 URL에 들어가면 글자가 body 색(거의 검정이나 흰색)을 물려받는다. | 클라이언트에서 `/^#[0-9a-fA-F]{6}$/`(bg는 transparent도 허용)에 맞을 때만 config에 반영하고, 아니면 `aria-invalid`로 표시한다. **해결**: 미완성 값은 입력칸에만 두고 `aria-invalid`와 빨간 테두리로 표시한다. 피커·프리셋·투명 초기화·변경 취소는 미완성 값을 지운다. | 측정 캡처 [modal-badcolor.png](ux-review/measure/modal-badcolor.png) · `src/components/timer/OverlaySettings.tsx:336-361`, `overlay/page.tsx:31` |
| ✅ UX-56 | 오버레이 URL이 틀리면 투명한 빈 화면만 나온다 · 오류 처리 | 404와 로딩 중을 구분할 수 없다. 단, 방송 화면에 오류 문구를 띄우면 시청자에게 그대로 노출된다. | 오버레이에는 아무것도 그리지 않고 `console.warn`만 남긴다. 확인은 설정 모달 쪽에서 한다. **해결**: 같은 상태 코드는 한 번만 `console.warn`(5초 폴링 누적 방지). | `src/app/timers/[id]/overlay/page.tsx:75-101, 174` |
| ✅ UX-57 | 투명 배경 미리보기가 라이트 테마에서 연회색이다 · 오버레이 | 흰 글씨와 미니멀 프리셋(#ccc, 그림자 없음)이 방송에서 어떻게 보일지 판단할 수 없다. | 투명일 때 테마와 무관하게 고정 중간 어두운 색(`#3f3f46`)을 쓴다. 체커보드는 쓰지 않는다. **해결**: 투명일 때 `#3f3f46`. | 측정 캡처 [modal-bottom-d-light.png](ux-review/measure/modal-bottom-d-light.png) · `src/components/timer/OverlaySettings.tsx:482` |
| ✅ UX-58 | 시간대 차트(횟수)에 단위가 없어 일별 차트(시간)와 헷갈린다 · 통계 | 두 차트의 색, 범례, 누적 형태가 같다. | 시간대 차트만 제목을 '시간대별 이벤트 횟수'로 바꾸거나 Y축에 `${v}회`를 붙인다. **해결**: 제목을 '시간대별 이벤트 횟수'로 바꿨다. | [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/components/stats/HourlyActivityChart.tsx`, `src/app/timers/[id]/stats/page.tsx:122` |
| ✅ UX-59 | 일별 차트가 추가와 차감을 쌓아서 막대 높이가 의미 없는 합이 된다 · 통계 | 시간대 차트의 누적값은 이벤트 수라서 의미가 있고, 일별 차트만 해당한다. | 선택 사항이다. 일별 차트에서 `stackId`를 제거한다. 툴팁에 정확한 값은 이미 있다. **해결**: 일별 차트에서 `stackId`를 제거했다. | `src/components/stats/DailyActivityChart.tsx:81-82` |
| ✅ UX-60 | 차트가 `role=img`에 고정 라벨만 달려 있다 · 접근성 | 스크린리더 사용자는 차트 데이터를 얻을 수 없다. | 이미 있는 데이터로 aria-label 요약을 만든다(예: '최다 N시 M회, 총 K회'). **해결**: 시간대는 '최다 N시 M회, 총 K회', 일별은 기간·추가/차감 합계·추가 최다 날을 aria-label로 요약한다. | `src/components/stats/HourlyActivityChart.tsx:37`, `DailyActivityChart.tsx:41` |
| ✅ UX-61 | KPI 카드의 초 단위 보조문구가 같은 값을 반복한다 · 단순화 | '300,900초'와 '9,000초'는 바로 위 시간 값을 초로 다시 쓴 것이다. 정의를 설명하는 보조문구는 유용하다. | `StatsCardGrid.tsx:17, 22`의 초 단위 subtext만 삭제한다. **해결**: 초 단위 subtext 두 개를 삭제했다. | [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/components/stats/StatsCardGrid.tsx:17, 22` |
| ✅ UX-62 | 랭킹 열 이름 '총 시간'이 카드의 '총 후원 시간'과 다르고, 1440px에서 표가 지나치게 넓다 · 정보구조 | 닉네임과 시간 사이가 약 600px 벌어져 행을 짚기 어렵다. | 열 이름을 '후원 시간'으로 바꾸고 표에 `max-w-2xl`을 준다. **해결**: 열 이름 '후원 시간', 표 `max-w-2xl`. | [19-timer-stats--d-light.png](ux-review/19-timer-stats--d-light.png) · `src/components/stats/DonorRankingTable.tsx:26, 31` |
| ✅ UX-63 | 일별 차트가 최근 30일로 잘리는데 안내가 없다 · 카피 | 장기 서브어톤에서는 카드 합계와 막대 합이 맞지 않는다. | 제목을 고정으로 '일별 활동 (최근 30일)'로 바꾼다. **해결**: 페이지 h2를 '일별 활동 (최근 30일)'로. | `src/components/stats/DailyActivityChart.tsx:30-31` |
| ✅ UX-64 | 단축키 도움말이 div 기반 다이얼로그이고 닫기 버튼이 없다 · 일관성 | `.claude/rules/ui.md`의 다이얼로그 재사용 규칙과 다르다. ESC와 배경 클릭으로는 닫힌다. | `FormDialog(title="키보드 단축키")`로 감싼다. **해결**: FormDialog로 감쌌다. 본문은 localStorage를 읽으므로 열렸을 때만 렌더한다. | [14-timer-shortcut-help--d-light.png](ux-review/14-timer-shortcut-help--d-light.png) · `src/app/timers/[id]/page.tsx:660-700` |
| ✅ UX-65 | 성공 토스트가 마운트되면서 role=status를 함께 삽입한다 · 접근성 | 새로 삽입된 status 노드는 읽히지 않을 수 있다. 오류(role=alert)는 안정적으로 읽힌다. | success와 info에만 상시 렌더하는 polite live region을 쓴다. 바꾸면 ui.md 규칙도 갱신한다. **해결**: `ToastProvider`가 sr-only `role=status` live region을 항상 렌더하고 성공·정보 문구만 넣는다. 오류는 토스트마다 `role=alert`. ui.md 규칙도 갱신했다. | `src/components/ui/Toast.tsx:61-88` |
| ✅ UX-66 | 추가/차감 radio가 탭 정지 2개이고 화살표 키를 지원하지 않는다 · 접근성 | 표준 radio 패턴과 다르다. 연결 대상이 없는 `<label>`이 그룹 제목으로 쓰인다. | roving tabIndex와 ArrowLeft/Right 처리를 넣는다. 그룹 제목 label은 span으로 바꾼다(선택). **해결**: roving tabIndex와 화살표 키(선택과 포커스 함께 이동). '변경 유형'은 span + `aria-labelledby`, 오버레이 설정의 연결 대상 없는 그룹 제목 label도 span으로 바꿨다. | `src/components/timer/TimerControls.tsx:268-310, 330`, `OverlaySettings.tsx:253, 377` |
| ✅ UX-67 | 로그인 CTA가 공용 Button이 아닌 검정 링크다 · 일관성 | 앱의 primary(accent)와 다르다. 선택 상태 표현이 4가지로 갈리는 문제는 개별 사용성 문제가 아니라 범위에서 뺐다. | 공용 Button primary 스타일로 바꾼다. **해결**: API 라우트로 전체 이동해야 해서 `<a>`를 유지하고 Button primary와 같은 클래스를 입혔다. | [01-login--d-light.png](ux-review/01-login--d-light.png) · `src/app/(auth)/login/page.tsx:27-32` |
| ✅ UX-68 | '목표' 섹션 제목이 목표 카드 제목과 같은 크기다 · 일관성 | h2 text-sm인 '목표'와 h3 text-sm인 카드 제목의 위계가 구분되지 않는다. | '목표' h2만 `border-l-2 border-accent pl-3 text-lg font-bold`로 바꾼다. **해결**: 권고대로. | [07-project-detail-running-owner--d-light.png](ux-review/07-project-detail-running-owner--d-light.png) · `src/app/projects/[id]/page.tsx:64` |
| ✅ UX-69 | 브레드크럼 '프로젝트'와 헤더 '프로젝트'가 서로 다른 곳으로 간다 · 정보구조 | 브레드크럼은 상위 프로젝트로, 헤더는 목록으로 간다. | 브레드크럼 라벨을 상위 프로젝트 이름으로 바꾼다. **해결**: 응답에 프로젝트 이름이 없어 `GET`·`PATCH /api/timers/[id]`에 `projectName`을 추가했다(API.md 갱신). 이후 타이머 화면이 프로젝트 화면으로 합쳐져 브레드크럼은 없어졌다. | [11-timer-running-owner--d-light.png](ux-review/11-timer-running-owner--d-light.png) · `src/app/timers/[id]/page.tsx:365-371` |
| ✅ UX-70 | 사소한 비일관 묶음 · 일관성 | 확인 라벨 '삭제'와 '삭제하기'가 섞여 있다. 타이머 페이지는 자체 스피너를 쓰고 Spinner와 TimerCard 컴포넌트는 실제 페이지에서 쓰이지 않는다. 푸터가 영문 'Contact:'다. **브랜드 표기가 UI, README, title은 '삼루먼', CLAUDE.md와 docs는 '삼루만'으로 다르다.** | 확인 라벨을 '삭제'로 통일한다. Spinner를 재사용하고 미사용 TimerCard는 정리한다. 푸터를 '문의:'로 바꾼다. ~~브랜드 표기는 사용자가 정한 뒤 코드와 문서 한쪽에 맞춘다.~~ **해결: '삼루먼'으로 통일했다.** **해결: 확인 라벨 '삭제' 통일, 타이머 페이지 스피너를 Spinner로 교체, 미사용 TimerCard와 스토리 삭제(문서 목록 갱신), 푸터 '문의:'.** | [13-timer-delete-confirm--d-light.png](ux-review/13-timer-delete-confirm--d-light.png) · `src/components/goal/GoalCard.tsx:198`, `src/app/timers/[id]/page.tsx:516, 637`, `src/components/layout/Footer.tsx:4`, `src/app/layout.tsx:21` |
| ✅ UX-71 | `docs/UI.md`는 모바일 그래프를 가로 스크롤한다고 쓰지만 코드는 반응형으로 축소한다 · 문서 | 측정한 모든 화면의 scrollWidth가 390이다. 문서를 믿은 후속 작업자가 가로 스크롤을 다시 넣을 수 있다. | `UI.md:145`를 '컨테이너 폭에 맞춰 축소(ResponsiveContainer)'로 고친다. **해결**: 실제 위치는 `UI.md:157`. '컨테이너 폭에 맞춰 축소(ResponsiveContainer, 가로 스크롤 없음)'로 고쳤다. | `docs/UI.md:145`, `src/components/graph/RemainingChart.tsx` |
| ✅ UX-72 | 분과 초 입력이 59를 넘으면 안내 없이 59로 잘린다 · 피드백 | '90'을 치면 59가 된다. 확인 버튼에 '(59분)'으로 표시되기는 한다. | 입력칸 옆에 '0~59' 힌트를 둔다. **해결**: 입력 줄 아래에 '분과 초는 0~59까지 입력할 수 있습니다.'를 두고 `aria-describedby`로 연결했다. | `src/components/timer/TimerControls.tsx:357-373` |
| ✅ UX-73 | 만료와 활성화 로그의 행위자가 영문 'system' 그대로 나온다 · 카피 | 시청자 열에 'system'이라는 닉네임이 있는 것처럼 읽힌다. | 표시할 때 actorUserId가 null이고 EXPIRE나 ACTIVATE이면 '자동'으로 바꿔 보여 준다(DB 값은 유지). **해결**: `displayActorName()`(utils)로 화면에서만 바꾼다. | [16-timer-expired--m-light.png](ux-review/16-timer-expired--m-light.png) · `src/lib/timer.ts:36, 77`, `src/app/timers/[id]/page.tsx:551, 594` |
| ✅ UX-74 | 세션이 만료되어 다시 로그인하면 항상 목록으로 간다 · 오류 처리 | 갱신이 실패할 때만 발생하므로 드물지만, 원래 보던 타이머로 다시 찾아가야 한다. | `/login?next=<경로>`로 보내고, 콜백에서 `/^\/(?!\/|\\)/`에 맞는 상대 경로만 허용해 리다이렉트한다. **해결**: `next`를 `oauth_next` 쿠키(httpOnly, 10분)로 OAuth 왕복에 싣는다. 검증은 `sanitizeNextPath()`(`/`로 시작, `//`·역슬래시·공백·제어 문자 없음, 출처 불변, `/login`·`/api/` 제외)를 로그인 라우트와 콜백에서 모두 거친다. AUTH.md 갱신. | `src/components/providers/SessionExpiredHandler.tsx:12-16`, `src/app/api/auth/callback/route.ts:80` |

### 추가 수정

리뷰 문서 밖에서 발견해 '기타 minor' 묶음과 함께 고친 결함이다.

- **단축키가 Cmd/Ctrl/Alt 조합을 가로챘다** — 해결. `useKeyboardShortcuts`가 수정자 키를 X에서만 걸러, Cmd+1(브라우저 탭 전환)이 1시간 추가를 보내고 Cmd+R 새로고침이 막혔다. 모든 단축키에서 Cmd/Ctrl/Alt 조합을 무시하고(Shift는 '?' 입력에 필요해 유지), R/G도 X처럼 `e.code`(KeyR/KeyG)로 매칭해 한국어 IME에서 동작하게 했다. `src/hooks/useKeyboardShortcuts.ts`

## 5. 우선순위 제안

### 즉시 (방송 중 잘못된 시간 기록과 키보드 접근 불가)
UX-01, UX-02, UX-03, UX-04, UX-05, UX-06

- 이 묶음은 **잘못된 데이터가 방송 화면과 기록에 바로 남는** 결함이다. 스트리머가 '빠르게' 쓰라고 만든 경로(단축키, 빠른 적용, 하단 바)에는 확인 단계가 없어서, 결함 하나가 그대로 차감 오기록이나 입력 누락이 된다.
- 고치는 비용이 작다. Tab 제거, state 끌어올리기, `enabled` 조건 추가, 라벨 부호 변경, `pointer-events-auto` 제거, SQL modifier 추가 정도이고 서로 독립적이다.
- UX-01과 UX-02는 같은 Tab 단축키에서 나오므로 함께 고친다.

### 단기 (대비와 접근성, 실패 피드백, 정보 일관성)
- **대비 토큰 일괄 수정**: UX-07, UX-08, UX-09, UX-26, UX-28. 대부분 토큰이나 클래스 한 줄이고 한 PR로 묶을 수 있다. 라이트 모드 AA 미달이 화면 전반에 반복되므로 개별보다 일괄 처리가 효율적이다.
- **실패와 상태 피드백**: UX-10, UX-11, UX-12, UX-13, UX-14, UX-34, UX-35, UX-36. 성공과 실패를 정확히 알리는 것이 방송 중 신뢰의 기본이다.
- **모바일 조작부**: UX-15, UX-16, UX-17, UX-18, UX-19, UX-29, UX-30, UX-33. 휴대폰 조작 시나리오의 오탭과 판독성 문제다.
- **오버레이 설정**: UX-20, UX-21, UX-23, UX-24. 안내 한 줄과 블록 이동 수준으로 'OBS에 반영 안 됨' 혼란을 없앤다.
- **기타 minor**: UX-27, UX-31, UX-32, UX-37~UX-42. 버그 성격(UX-27 눈금, UX-38 cn)을 먼저 처리한다.

### 보류 (필요가 확인될 때)
- UX-22(미리보기 스케일링)는 이후 해결했다. UX-43의 '지금 시작'은 2026-10에 구현했다(시작 시각 변경은 보류).
- UX-37의 상태 배지 버전은 목록 API 변경이 필요하다. 최소안('타이머 없음' 표시)만 단기로 했다(해결).
- nit(UX-44~UX-74)는 UX-53을 제외하고 모두 해결했다. UX-53은 변경하지 않기로 하고 보류했다.

## 6. 검토했으나 채택하지 않은 제안

반박 검증에서 사실 오류, 취향, 장식, 이미 처리됨 등의 이유로 빠지거나 줄어든 제안 가운데 대표적인 것을 남긴다.

| 원래 제안 | 판정 | 이유 |
|---|---|---|
| 로그아웃에 확인 다이얼로그 추가 | 취향, 과잉 | 다시 로그인하면 복구되고 데이터 손실이 없다. 터치 영역 확대(UX-19)로 충분하다. |
| 오버레이 페이지가 저장된 설정을 서버에서 읽도록 구조 변경 | 과잉 | 혼란의 원인은 안내 부족이다. 추가 요청과 타이밍 의존이 생기므로 안내 한 줄(UX-20)로 대체했다. |
| 오버레이 모달 푸터에 '복사' 버튼 추가, 생성 다이얼로그 sticky 푸터 | 과잉 | 푸터가 이미 꽉 차 있고, 본문 스크롤과 반쯤 보이는 버튼이 스크롤 단서 역할을 한다. 블록 이동(UX-21)으로 대체했다. 이후 C069에서 버튼을 더하지 않고 '저장'을 저장 포함 'URL 복사'로 바꾸는 방식으로 다시 다뤘다. |
| 모바일에서 카드 안 프리셋 숨기기 | 사실 오류(부작용) | 프리셋은 조합 금액(예: 6시간)을 누적하는 유일한 수단이다. 백로그 '빠른 적용 모드 제거'와 함께 다룬다. |
| 만료 상태에서 하단 바와 숫자 단축키 비활성화 | 과잉 | 끝난 타이머를 빠르게 연장하는 것은 정당한 방송 흐름이다. 예고 한 줄(UX-13)만 채택했다. |
| 긴급 상태 서브텍스트 '곧 종료 · 5분 미만' 추가 | 불필요 | 숫자 00:04:xx가 이미 상태를 텍스트로 전한다. 색 대비 수정(UX-08)만 채택했다. |
| 긴급 펄스의 최저 opacity를 0.85 이상으로 | 기능 약화 | 긴급 신호를 약하게 만든다. 대신 `prefers-reduced-motion`으로 끄는 규칙을 채택했다. |
| 오버레이에 '타이머를 찾을 수 없습니다' 텍스트 표시 | 사실 오류(부작용) | OBS는 미리보기와 방송을 구분하지 못하므로 오류 문구가 시청자에게 노출된다. |
| 미리보기 배경 체커보드 | 장식 | 단색 하나로 흰 글씨를 판단하기에 충분하다. |
| 만료 확인 문구에 마지막 EXPIRE 로그 시각 표시 | 과잉 | CountdownDisplay에 새 prop과 결합이 생긴다. |
| Y축 `allowDecimals={false}` | 사실 오류 | tick이 초 단위 정수라 효과가 없다. |
| `word-break: keep-all` 전역 적용, 헤더 배지와 아이콘을 제목 아래로 이동 | 과잉 | 표와 로그 줄바꿈까지 바뀐다. 제목과 설명에만 적용하면 문제가 풀린다. |
| 목표 카드의 '목표 취소'를 ghost로 낮추고 진행 중 탭에서 배지 숨기기 | 취향 | 이미 secondary 버튼이고, 배지는 접힘과 컴팩트 상태에서도 쓰인다. 문구 수정(UX-40)만 채택했다. |
| 거의 모든 컨테이너에 쓰인 accent 틴트를 중립색으로 | 취향 | 10~20% 틴트이고 과업 실패 근거가 없다. 미사용 TimerCard 정리만 UX-70에 남겼다. |
| 같은 색이 다른 의미로 재사용되는 배지(실행 중과 추가가 모두 초록) | 취향 | 모든 배지에 텍스트 라벨이 있어 색에만 의존하지 않는다. 대비(UX-09)만 채택했다. |
| 신규 유저 빈 상태에서 헤더 '새 프로젝트' 숨기기 | 과잉 | 상태마다 레이아웃이 바뀌는 비용이 더 크다. 중복 CTA는 해롭지 않다. |
| 토스트에 '+1시간 · 치즈냥'처럼 양과 닉네임 표시 | 새 기능 | 지적한 문제(거짓 성공, 탭 가로채기)와 무관하다. |
| 모바일 '+1h' 라벨을 '시간'으로 통일, '후원자'를 '시청자'로 통일 | 취향 | 고정 바의 공간 절약은 의도된 선택이고, '후원자'는 서브어톤의 도메인 용어다. |
| 타이머 조작 화면에 GoalProgressBar 목록 추가 | 새 기능 | 브레드크럼으로 한 번에 이동할 수 있다. 필요하면 읽기 전용 한 줄(UX-53)만 둔다. |
| '프로젝트 상세 404가 막다른 길'이라는 주장 | 사실 오류 | 헤더 로고가 `/`에서 `/projects`로 리다이렉트된다. 오류 분기(UX-36)만 채택했다. 이후 2026-10-04 UX 백로그(W18)에서 막다른 길은 아니지만 본문에 다음 행동이 없다는 점을 받아들여, 404·권한 없음 화면에 h1과 돌아갈 링크 하나를 두었다(`docs/UI.md` '찾을 수 없음·권한 없음'). |

## 7. 리뷰 한계

- **실기기를 확인하지 않았다.** 모바일은 Playwright 390x844 에뮬레이션 결과다. iOS Safari의 safe-area, 주소창 높이 변화(`100vh`), 실제 손가락 오탭률, OS 수준 '동작 줄이기' 설정은 검증하지 못했다.
- **실제 OBS에서 확인하지 않았다.** 오버레이는 Chromium 1920x1080 페이지로 측정했다. OBS 브라우저 소스의 렌더링, 크로마 합성, 장시간 실행 시 메모리와 드리프트는 확인하지 않았다.
- **스크린리더로 실제 청취하지 않았다.** 접근성은 DOM 속성, 계산된 대비, 키보드 이벤트 실측에 근거한다. NVDA나 VoiceOver의 실제 낭독 차이(토스트 live region 등)는 추정이 섞여 있다.
- **캡처하지 못한 상태**: 1분 미만(critical) 긴급 상태의 정적 캡처, 오버레이 변화량 애니메이션의 중간 프레임, 실제 네트워크 장애와 느린 회선, 세션 만료 직후 흐름, 30일이 넘는 장기 통계 데이터, 다수 기기 동시 조작 시의 실시간 반영, 브라우저 확대(200%)와 큰 글꼴 설정.
- **시드 데이터의 한계**: 로그 수, 목표 수, 닉네임 길이가 실제 방송 규모와 다를 수 있다. 아주 긴 프로젝트나 타이머 이름이 넘치는 경우는 코드로만 추론했다.
- **일부 검증은 코드 근거에만 의존했다.** 실패 경로(삭제 실패, 클립보드 거부, 404 오버레이)는 정적 캡처에 드러나지 않아 코드와 모의 응답으로 확인했다. 검증 단계에서 다시 측정하지 않은 수치(일부 대비비, 버튼 크기)는 리뷰 단계의 측정값을 그대로 옮겼다.
- 대비비는 sRGB 상대 휘도 공식으로 계산했다. 반투명 요소는 배경과 합성한 값이다.
