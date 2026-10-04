# Apple 수준 완성도 체크리스트 (삼루먼타이머 콘솔)

근거는 Apple HIG 공식 페이지에서 확인된 지침만 쓴다. 웹앱이므로 iOS 전용 지침은 원리만 옮기고 그대로 강요하지 않는다. 대상 화면: 조작 콘솔(카운트다운·닉네임·추가/차감 세그먼트·프리셋·시분초 입력·확인 버튼·목표·최근 변경·그래프), 모바일 하단 즉시 적용 바, 더보기 메뉴, OBS 오버레이 설정 모달.

판정 기호: **합격 / 경고 / 불합격**. 측정은 390px(모바일), 1280px(데스크톱) 두 폭을 기본으로 하고 항목별로 추가 폭을 명시한다.

---

## A. 타이포그래피 위계

### H1. 보조 텍스트도 11px 미만으로 내리지 않고 본문은 17px 안팎이다
- 근거: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — "Use font sizes that most people can read easily." (iOS 기본 17pt, 최소 11pt; 본문 17pt·행간 22pt, Footnote 13pt·행간 18pt)
- 판정: 390px 폭에서 `getComputedStyle`로 모든 텍스트 노드의 `font-size`를 수집한다. 11px 미만이 하나라도 있으면 불합격, 본문(설명·로그 행)이 15~17px 범위를 벗어나면 경고. 닉네임·프리셋·최근 변경 행도 포함해 측정한다.

### H2. 카운트다운 숫자가 본문보다 뚜렷하게 크다
- 근거: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — 굵기·크기·색을 조절해 위계를 만든다.
- 판정: 카운트다운 `font-size` ÷ 본문 `font-size` 비율을 계산한다. 390px에서 2.5배 미만이면 경고. 곁눈질로 읽히는 화면이므로 1m 거리 스크린샷 축소본(25%)에서 숫자만 식별되는지 본다.

### H3. font-weight 300 이하를 쓰지 않는다
- 근거: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — "In general, avoid light font weights."
- 판정: `src/` CSS·Tailwind 클래스에서 `font-weight: 100~300`, `font-thin`, `font-extralight`, `font-light`를 grep한다. 렌더된 모든 요소의 computed `font-weight`가 400 이상이면 합격, 300 이하가 있으면 불합격.

### H4. 위계는 크기·굵기·색 농도로 만들고 모든 텍스트를 같은 굵기·색으로 두지 않는다
- 근거: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — 굵기·크기·색을 조절해 위계를 만든다.
- 판정: 콘솔 카드 하나(예: 최근 변경)의 제목·본문·보조(시각) 세 층의 (font-size, font-weight, color)를 추출해 서로 다른 조합인지 확인한다. 세 층이 두 가지 이하 조합이면 경고.

---

## B. 색·다크 모드

### H5. 추가/차감, 실행/일시정지/종료를 색만으로 구분하지 않는다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — "Avoid relying solely on color to differentiate between objects"
- 판정: 콘솔·최근 변경·하단 바 스크린샷을 흑백(grayscale 100%) 변환한다. 추가/차감 세그먼트, 로그 행의 +/−, 타이머 상태가 기호·텍스트·아이콘으로 구분되면 합격. 색 없이 구분 불가한 요소가 있으면 불합격.

### H6. 같은 색이 서로 다른 뜻으로 재사용되지 않는다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — 같은 색이 서로 다른 뜻을 가지지 않도록 일관되게 쓴다.
- 판정: 콘솔 전체 스크린샷에서 빨강·초록·강조색이 쓰인 자리를 모두 적고 각 의미(차감·오류·추가·성공·주 동작 등)를 붙인다. 한 색에 두 의미 이상이 붙으면 경고.

### H7. 색은 의미 토큰(CSS 변수)으로 정의되고 컴포넌트에 hex가 흩어져 있지 않다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — "Make sure all your app's colors work well in light, dark, and increased contrast contexts."
- 판정: `src/components`, `src/app`에서 `#[0-9a-f]{3,8}`, `rgb(`, `hsl(`, Tailwind 원색 클래스(`text-gray-500`, `bg-red-500` 등)를 grep해 `globals.css` 토큰 밖에 직접 박힌 색 개수를 센다. 0이면 합격, 있으면 목록화해 경고.

### H8. 시맨틱 토큰의 용도를 바꿔 쓰지 않는다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — separator를 텍스트에, secondaryLabel을 배경에 쓰지 않는다.
- 판정: 구분선 토큰(border/separator)이 `color:`에, 라벨 토큰이 `background:`에 쓰인 곳을 grep한다. 하나라도 있으면 경고.

### H9. 라이트·다크·고대비 세 환경 모두에서 깨진 색이 없다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — "Make sure all your app's colors work well in light, dark, and increased contrast contexts."
- 판정: `prefers-color-scheme: dark`, `prefers-contrast: more`를 에뮬레이션해 콘솔·메뉴·모달·하단 바 스크린샷을 찍는다. 배경과 같은 색으로 사라진 텍스트, 다크 모드에서만 남은 밝은 면, 고대비에서 변화 없는 보조 텍스트가 있으면 불합격.

### H10. 다크 모드는 반전이 아니라 깊이 단계(기본·elevated)를 갖는다
- 근거: [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — iOS에서는 기본(어두운) 배경과 elevated(밝은) 배경을 나눠 깊이를 표현한다.
- 판정: 다크 모드에서 페이지 배경, 카드, 더보기 메뉴, 모달, 하단 바의 computed `background-color` 명도(L)를 측정한다. 위에 뜨는 면(메뉴·모달·하단 바)의 L이 기본 배경보다 높으면 합격, 같거나 낮으면 경고.

### H11. 다크 모드에 순백(#fff) 면이 남아 있지 않다
- 근거: [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — 흰 배경 이미지는 눈부시지 않게 완화한다.
- 판정: 다크 모드 스크린샷에서 `#ffffff` 또는 L≥97인 면적 비율을 계산한다. 어두운 방송 환경을 가정하므로 면적 1% 초과 시 경고, 큰 카드·모달 전체가 순백이면 불합격.

### H12. 외관은 시스템 설정(prefers-color-scheme)을 따르고 앱 고유 토글은 재검토한다
- 근거: [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — "Avoid offering an app-specific appearance setting."
- 판정: 시스템 다크 설정만 바꿨을 때 콘솔이 즉시 따라오면 합격. 앱 내 토글이 있다면 기본값이 "시스템 따름"인지, 아니면 경고로 기록한다.

---

## C. 레이아웃·여백·정렬

### H13. 가장 중요한 항목(카운트다운, 추가/차감, 확인)이 위쪽·시작 쪽에 있다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — "Place the most important items near the top and leading side"
- 판정: 데스크톱·모바일 첫 화면(스크롤 0) 스크린샷에서 카운트다운과 주 조작(세그먼트·프리셋·확인 또는 하단 바)이 뷰포트 안에 보이면 합격. 목표·최근 변경·그래프가 카운트다운보다 위에 있으면 불합격.

### H14. 관련 요소는 군집으로 묶이고 군집 간 간격이 군집 내 간격보다 크다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 관련 요소는 여백·컨테이너 모양·구분선으로 묶는다.
- 판정: 닉네임·세그먼트·프리셋·시분초·확인 군집 내부의 요소 간 거리와, 그 군집과 목표/최근 변경 카드 사이 거리를 `getBoundingClientRect`로 잰다. 군집 간 ≥ 군집 내 × 1.5면 합격, 작으면 경고.

### H15. 왼쪽 정렬선이 일관적이다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 정렬로 정돈된 인상을 준다.
- 판정: 콘솔의 카드 제목·본문·컨트롤의 `left` 값을 수집해 고유값 개수를 센다. 390px에서 3개 이하면 합격, 1~2px 어긋난 짝이 있으면 경고.

### H16. 드문 동작은 더보기 메뉴와 모달로 점진적 공개한다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 점진적 공개(메뉴·중첩 뷰)로 처음 보이는 양을 줄인다.
- 판정: 첫 화면에 노출된 버튼 수를 센다. 방송 중 매 조작에 쓰지 않는 항목(오버레이 설정·삭제·계정 등)이 첫 화면에 직접 보이면 경고.

### H17. 레이아웃은 기기 판별이 아니라 폭 기준으로 전환된다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — "Determine layout based on size classes, not device type or orientation"
- 판정: 코드에서 `navigator.userAgent`, `ontouchstart` 기반 분기를 grep한다. 320·390·768·1280px 및 가로 모드(844×390) 스크린샷에서 하단 바 ↔ 데스크톱 레이아웃 전환이 폭에서만 일어나면 합격.

### H18. 모바일 하단 바가 safe-area-inset-bottom을 반영한다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 모바일에서는 엄지 접근 영역의 하단 바가 일반적이다(safe area 반영).
- 판정: 하단 바 CSS에 `env(safe-area-inset-bottom)`과 `viewport-fit=cover`가 있는지 확인하고, iPhone 에뮬레이션 스크린샷에서 홈 인디케이터와 버튼이 겹치지 않으면 합격.

### H19. 확대된 텍스트에서 가로 나열이 세로로 쌓인다
- 근거: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 확대된 텍스트에서는 가로로 나란한 뷰를 세로로 쌓는다.
- 판정: 브라우저 기본 글꼴을 24px로, 또는 페이지 줌 200%로 두고 390px 스크린샷을 찍는다. 가로 스크롤이 생기거나 텍스트가 잘리면 불합격.

### H20. 강조색 면과 로고·장식이 콘텐츠에 양보한다
- 근거: [Branding](https://developer.apple.com/design/human-interface-guidelines/branding) — "Ensure branding always defers to content."
- 판정: 콘솔 스크린샷에서 강조색이 칠해진 면 개수(1~2곳이 적정)와, 상단 로고·장식 면적을 카운트다운 면적과 비교한다. 강조면 3개 이상 또는 로고 면적 > 카운트다운 면적이면 경고.

---

## D. 컨트롤(버튼·세그먼트·메뉴·입력)

### H21. 채워진 강조 버튼은 뷰당 1~2개(확인/적용)이다
- 근거: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) — "Keep the number of prominent buttons to one or two per view."
- 판정: 콘솔 전체·하단 바·모달 각각에서 채워진(filled) 강조 버튼을 센다. 3개 이상이면 불합격. 버튼 크기 차이가 위계의 유일한 근거면 경고.

### H22. 파괴적 동작(차감·삭제·초기화)에 primary 스타일을 주지 않고 빨강으로 구분한다
- 근거: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) — "Don't assign the primary role to a button that performs a destructive action"
- 판정: 차감 모드로 전환한 스크린샷과 삭제·초기화 UI 스크린샷에서 강조 채움이 파괴적 동작에 붙어 있으면 불합격. Enter 키 기본 동작이 삭제·초기화에 연결돼 있으면 불합격.

### H23. 추가/차감 세그먼트는 같은 폭의 명사 라벨 2칸이고 동작을 섞지 않는다
- 근거: [Segmented Controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) — "Aim for no more than about five to seven segments in a wide interface and no more than about five segments on iPhone."
- 판정: 세그먼트 각 칸의 `width`를 측정해 오차 1px 이내면 합격. 칸 안에 즉시 실행 동작이 섞여 있거나, 텍스트와 아이콘이 혼재하거나, 모바일에서 5칸 초과면 불합격.

### H24. 프리셋은 5개 안팎으로 제한하고 넘치면 메뉴로 넘긴다
- 근거: [Segmented Controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) — 세그먼트 수 제한 원리 적용.
- 판정: 390px에서 한 번에 보이는 프리셋 개수를 센다. 7개 초과이거나 가로 스크롤로 숨겨진 프리셋이 있으면 경고.

### H25. 시분초 스테퍼(+/−)는 어느 값을 바꾸는지 붙어 있고 텍스트 필드와 함께 있다
- 근거: [Steppers](https://developer.apple.com/design/human-interface-guidelines/steppers) — "Consider pairing a stepper with a text field when large value changes are likely."
- 판정: 시분초 입력 스크린샷에서 +/− 컨트롤과 해당 필드 사이 거리가 다른 필드와의 거리보다 짧으면 합격. 90분을 넣는 데 필요한 탭 수를 센다(프리셋·직접 입력 포함 3회 이하 권장).

### H26. 닉네임·시분초 필드에 placeholder와 별개로 상시 라벨이 있다
- 근거: [Text Fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) — "Because placeholder text disappears when people start typing, it can also be useful to include a separate label."
- 판정: 모든 필드에 값을 채운 스크린샷에서 각 필드의 용도(닉네임·시·분·초)가 보이는 라벨 또는 단위로 식별되면 합격. `aria-label`만 있고 시각 라벨이 없으면 경고.

### H27. 시분초 필드는 숫자 전용이고 폭이 자릿수에 맞는다
- 근거: [Text Fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) — 숫자 데이터에는 숫자 포매터를 쓰며 상황에 맞는 키보드 타입을 보여준다.
- 판정: `inputmode="numeric"` 또는 `pattern="[0-9]*"`가 있는지 DOM에서 확인하고, 모바일 에뮬레이터에서 숫자 키패드가 뜨면 합격. 필드 폭이 최대 자릿수(2~3자)의 3배를 넘으면 경고.

### H28. 닉네임 필드는 값이 있을 때만 끝쪽에 지우기 버튼을 보인다
- 근거: [Text Fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) — "Display a Clear button in the trailing end of a text field"
- 판정: 값 있음/없음 두 스크린샷을 비교한다. 값 있을 때 오른쪽 끝 × 버튼이 있고 비었을 때 없으면 합격. 버튼 히트 영역이 44px 미만이거나 접근 가능한 이름이 없으면 경고.

### H29. 더보기 메뉴는 구분선으로 그룹화되고 자주 쓰는 항목이 위에 있다
- 근거: [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) — 논리적으로 관련된 항목끼리 구분선으로 묶고 중요하거나 자주 쓰는 항목을 앞에 둔다.
- 판정: 더보기 메뉴 스크린샷에서 그룹 구분선 유무와 항목 순서(타이머 조작 → 오버레이 → 계정)를 본다. 구분선 없이 5개 이상 나열되면 경고.

### H30. 메뉴 그룹 안에서 아이콘 유무가 통일되고 모달을 여는 항목에 말줄임표가 있다
- 근거: [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) — "provide icons for all menu items in a group, or none of them"
- 판정: 각 그룹에서 아이콘 있는 항목 수가 0 또는 전체이면 합격. 'OBS 오버레이 설정…'처럼 추가 입력이 필요한 항목에 `…`가 없으면 경고. 서브메뉴가 2단계 이상이면 불합격.

### H31. 상단 바·하단 바는 컨트롤 그룹 3개 이하, 주 동작 1개를 오른쪽 끝에 둔다
- 근거: [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) — "Only specify one primary action, and put it on the trailing side of the toolbar"
- 판정: 상단 바와 하단 즉시 적용 바 스크린샷에서 그룹 수, 강조 동작 개수와 위치, 제목 글자 수(15자 미만)를 센다. 강조 동작 2개 이상이거나 왼쪽에 있으면 경고.

---

## E. 피드백·로딩·undo

### H32. 추가/차감 결과는 색 외에 부호·텍스트로도 표시되고 aria-live로 알린다
- 근거: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) — "Make sure all feedback is accessible."
- 판정: 흑백 스크린샷에서 변경 직후 로그 행('+10분')이 구분되면 합격. DOM에서 `aria-live` 또는 `role="status"` 영역에 변경 결과가 들어가는지 확인한다. 없으면 불합격.

### H33. 저장·동기화·연결 상태는 해당 영역 안에 조용히 통합된다
- 근거: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) — "Consider integrating status feedback into your interface."
- 판정: 상태 문구(적용 중·동기화·오프라인)가 카운트다운 카드 또는 하단 바 안에 있으면 합격. 토스트·모달로만 알리면 경고.

### H34. 일상 조작에 성공 토스트·확인 대화상자가 뜨지 않는다
- 근거: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) — "Use alerts to deliver critical — and ideally actionable — information."
- 판정: 프리셋 추가·차감·확인을 10회 수행하며 모달·토스트 출현 횟수를 센다. 0회면 합격. 실패(네트워크 오류·세션 만료)에서만 알림이 뜨는지 함께 확인한다.

### H35. 파괴적 동작에만 확인 단계가 있고 거부 시 이유를 한 문장으로 보여 준다
- 근거: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) — "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible."
- 판정: 삭제·초기화에 확인이 있고 추가/차감에 없으면 합격. 0 이하 차감 등 거부 케이스에서 원인과 해결 방법이 담긴 한국어 메시지가 뜨면 합격, 무반응이면 불합격.

### H36. 입력 즉시 검증하고 빈/0 입력에서 확인 버튼이 비활성이다
- 근거: [Entering Data](https://developer.apple.com/design/human-interface-guidelines/entering-data) — "When you verify values as soon as people enter them — and provide feedback as soon as you detect a problem"
- 판정: 문자·음수·분 60 이상을 입력해 제출 전에 인라인 피드백이 뜨면 합격. 빈 입력에서 확인 버튼 `disabled` 상태와 근처 이유 문구를 확인한다.

### H37. 가장 흔한 작업(프리셋 추가)이 탭 1~2회로 끝나고 필드에 기본값이 있다
- 근거: [Entering Data](https://developer.apple.com/design/human-interface-guidelines/entering-data) — "It's usually easier and more efficient to choose from lists of options than to type information"
- 판정: 프리셋 선택 → 적용까지 탭 수를 센다. 3회 이상이면 경고. 시분초 필드 기본값(0 또는 마지막 값)과 닉네임 최근 목록 유무를 스크린샷으로 본다.

### H38. 실행 취소가 있고 라벨에 대상을 적으며 연속 취소가 된다
- 근거: [Undo and Redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo) — "Avoid placing unnecessary limits on the number of times people can undo or redo."
- 판정: +10분 적용 후 실행 취소를 눌러 카운트다운이 원복되고 최근 변경에 반영되면 합격. 라벨이 '+10분 실행 취소'처럼 대상을 적는지, 2회 연속 취소가 되는지 확인한다. 실행 취소 자체가 없으면 불합격.

### H39. 최초 진입 시 빈 화면 대신 영역별 스켈레톤이 보이고 그래프 로딩 중에도 조작이 된다
- 근거: [Loading](https://developer.apple.com/design/human-interface-guidelines/loading) — "consider showing placeholder text, graphics, or animations as content loads, replacing these elements as content becomes available."
- 판정: 네트워크 Slow 3G로 콘솔을 열어 1초 시점 스크린샷을 찍는다. 빈 영역이 있으면 경고. 그래프 응답을 지연시킨 상태에서 시간 추가 버튼이 동작하면 합격.

### H40. 진행 표시는 형태를 바꾸지 않고 문구가 구체적이다
- 근거: [Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) — "Avoid vague terms like loading or authenticating because they seldom add value."
- 판정: 저장·오버레이 반영·그래프 로딩 상태 스크린샷에서 '로딩 중…' 같은 모호 문구가 있으면 경고. 상태 전환 중 스피너 ↔ 막대 변경이 있으면 경고. 응답 5초 지연 시 표시가 멈춘 듯 보이면 경고.

### H41. 온보딩은 전체 화면 투어가 아니라 컨트롤 근처의 한 번짜리 팁이다
- 근거: [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) — "Consider providing a collection of context-specific tips instead of a single onboarding flow."
- 판정: 신규 계정 첫 화면에서 전체 가림 투어가 있으면 경고. 팁이 대상 컨트롤과 인접(24px 이내)하고, 닫은 뒤 재방문 시 다시 뜨지 않으며, 더보기 메뉴에 재진입 경로가 있으면 합격.

---

## F. 모달·시트

### H42. OBS 오버레이 설정 모달은 단일 경로이고 모달 위에 모달을 겹치지 않는다
- 근거: [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) — "Present content modally only when there's a clear benefit."
- 판정: 모달을 열고 단계/계층 수를 센다. 탭·중첩 모달·두 번째 모달이 있으면 불합격. 한 화면에서 끝나면 합격.

### H43. 모달에 작업명 제목과 명확한 닫기가 있고 Esc·배경 탭으로 닫힌다
- 근거: [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) — "Always give people an obvious way to dismiss a modal view."
- 판정: 모달 스크린샷에 제목('오버레이 설정')과 닫기 버튼이 보이고, Esc·배경 클릭으로 닫히면 합격. 변경 후 닫을 때만 저장/버리기 확인이 뜨고 변경 없이 닫을 때는 안 뜨는지 확인한다.

### H44. 모바일에서는 하단 시트 형태로 취소(좌)·완료(우)·그래버·스와이프 닫기를 갖춘다
- 근거: [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) — "Display only one sheet at a time from the main interface"
- 판정: 390px에서 모달을 연 스크린샷에서 취소/완료 위치, 그래버 유무, 동시에 열린 시트 수를 본다. 설정이 길면 중간 높이에서 시작해 펼쳐지는지, 아래 스와이프로 닫히는지 직접 조작한다. 취소·완료·뒤로 세 버튼이 동시에 보이면 경고.

---

## G. 모션

### H45. 상시 움직이는 장식 모션이 없다
- 근거: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — "Add motion purposefully, supporting the experience without overshadowing it."
- 판정: 콘솔을 10초 녹화해 시간·상태 변화와 무관한 루프 애니메이션(숫자 흔들림·배경 모션·펄스)을 센다. 하나라도 있으면 불합격.

### H46. 피드백 애니메이션은 짧고 한 번 재생되며 다른 요소를 밀어내지 않는다
- 근거: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — "Aim for brevity and precision in feedback animations."
- 판정: 확인 버튼 적용 순간부터 피드백 종료까지 프레임 녹화로 길이를 잰다. 400ms 초과면 경고, 레이아웃을 밀어내거나 가리면 불합격.

### H47. 프리셋·세그먼트·시분초 같은 빈번 조작에 추가 모션이 없다
- 근거: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — "In apps, generally avoid adding motion to UI interactions that occur frequently."
- 판정: 프리셋·세그먼트·시분초 입력을 연속 10회 탭하며 녹화한다. 탭마다 바운스·확대·슬라이드가 붙으면 불합격. 색·불투명도 변화 정도만 있으면 합격.

### H48. 메뉴·모달 전환 중에도 입력이 즉시 먹는다
- 근거: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — "Let people cancel motion. ... don't make people wait for an animation to complete"
- 판정: 모달·메뉴가 열리는 도중 닫기 버튼이나 다른 컨트롤을 탭해 반응하면 합격. 전환 완료 후에만 반응하면 불합격.

### H49. 중요한 상태(성공·실패·종료)가 애니메이션 없이도 텍스트·아이콘으로 구분된다
- 근거: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — "Make motion optional. ... avoid using it as the only way to communicate important information."
- 판정: `prefers-reduced-motion: reduce`로 적용 성공·실패·타이머 종료를 재현한다. 화면 텍스트·아이콘·색만으로 세 상태가 구분되면 합격.

### H50. Reduce Motion에서 슬라이드·스케일·바운스·블러 전환이 페이드로 바뀐다
- 근거: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — "Replacing transitions in x-, y-, and z-axes with fades to avoid motion"
- 판정: reduce motion을 켜고 모달·메뉴·하단 바를 열고 닫는다. 위치 이동·확대·바운스·블러가 남아 있으면 불합격. CSS에 `@media (prefers-reduced-motion: reduce)` 블록이 있는지도 grep한다.

---

## H. 터치·포인터

### H51. 모든 탭 가능 요소가 44×44px 이상이고 28×28 미만은 없다
- 근거: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — "iOS, iPadOS: Default control size 44x44 pt, Minimum control size 28x28 pt"
- 판정: 390px에서 `button, a, input, [role=button], [role=menuitem]`의 `getBoundingClientRect` 너비·높이를 모두 수집한다. 44 미만은 경고 목록, 28 미만은 불합격. 세그먼트·프리셋·시분초·확인·하단 바·메뉴 항목·모달 닫기·닉네임 지우기를 반드시 포함한다.

### H52. 인접 컨트롤 사이 간격이 베젤 있음 12px, 없음 24px 이상이다
- 근거: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — "Include about 12 points of padding around elements that include a bezel."
- 판정: 인접 탭 요소 쌍의 경계 거리를 측정한다. 베젤 있는 요소(세그먼트·프리셋·확인) 사이 12px 미만, 베젤 없는 텍스트 버튼(더보기·닫기)의 히트 여유 24px 미만이면 목록화. 추가/차감 세그먼트 ↔ 확인 버튼 간격을 우선 본다.

### H53. 스와이프·드래그 동작마다 탭 가능한 버튼 경로가 있다
- 근거: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — "If you use a swipe gesture to dismiss a view, also make a button available"
- 판정: 스와이프·드래그로 가능한 동작(시트 닫기·메뉴 닫기·하단 바 확장 등)을 모두 적고 각각 버튼 또는 Esc 경로가 있는지 확인한다. 제스처 전용 동작이 하나라도 있으면 불합격. 멀티핑거 제스처 의존이 있으면 불합격.

### H54. 탭은 기대대로만 동작하고 비활성 상태에는 이유가 표시된다
- 근거: [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) — "Avoid using a familiar gesture like tap or swipe to perform an action that's unique to your app."
- 판정: 세그먼트 탭이 선택만, 확인 탭이 적용만 수행하는지 확인한다. 타이머 없음·종료 상태에서 버튼이 비활성 표시되고 이유('타이머 없음')가 화면에 보이면 합격. 비활성 탭에 아무 반응·설명이 없으면 불합격. 눌린 상태가 1프레임 내외로 나타나는지 녹화로 본다.

### H55. 키보드만으로 모든 컨트롤에 도달·활성화되고 표준 단축키를 가로채지 않는다
- 근거: [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards) — "Define custom keyboard shortcuts for only the most frequently used app-specific commands."
- 판정: Tab/Shift+Tab만으로 세그먼트·프리셋·시분초·확인·더보기·모달을 순회해 도달 못 하는 컨트롤과 포커스 링 없는 컨트롤 수를 센다(0이어야 합격). Cmd/Ctrl+C·V·R이 막히면 불합격. 닉네임·시분초 입력 중 `useKeyboardShortcuts` 단축키가 글자 입력을 가로채면 불합격.

### H56. hover는 절제된 하이라이트이고 마우스·터치·키보드 결과가 같다
- 근거: [Pointing Devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices) — "Provide a consistent experience in your app, whether people are using gestures, eyes, a pointing device, or a keyboard."
- 판정: 같은 컨트롤을 hover·탭·포커스 세 입력으로 조작해 결과·피드백을 비교한다. hover 시 크기가 변해 이웃과 겹치거나 레이아웃이 흔들리면 불합격. hover 전용으로만 나타나는 컨트롤이 터치·포커스에서 접근 불가하면 불합격.

---

## I. 접근성(종합)

### H57. 색·모션·제스처 어느 하나에만 의존하는 정보가 없다
- 근거: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — H5·H32·H49·H53의 종합.
- 판정: 흑백 + reduce motion + 키보드만 세 조건을 동시에 적용해 추가·차감·확인·취소·모달 닫기·상태 확인을 수행한다. 하나라도 불가하면 불합격.

### H58. 고대비(prefers-contrast: more)에서 보조 텍스트·구분선·비활성 상태가 더 진해진다
- 근거: [Color](https://developer.apple.com/design/human-interface-guidelines/color) — "Make sure all your app's colors work well in light, dark, and increased contrast contexts."
- 판정: 고대비 에뮬레이션 전후 보조 라벨·구분선·disabled 버튼의 computed color를 비교한다. 변화가 없으면 경고.

---

## J. 문구(writing)

### H59. 라벨은 명사(세그먼트)·동사(버튼)로 역할에 맞게 쓰고 모호한 문구를 피한다
- 근거: [Segmented Controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) — 라벨은 명사나 명사구로 쓴다; [Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) — "Avoid vague terms like loading or authenticating because they seldom add value."
- 판정: 세그먼트 라벨이 '추가'·'차감'처럼 명사이고, 로딩 문구가 '변경 기록 불러오는 중'처럼 대상을 적으면 합격. '로딩 중', '처리 중' 등 대상 없는 문구가 있으면 경고.

### H60. 오류 메시지는 원인과 해결 방법을 담은 한국어 한 문장이다
- 근거: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) — 명령을 수행할 수 없을 때는 이유를 이해시킨다.
- 판정: 네트워크 오류·세션 만료·0 이하 차감 세 케이스의 메시지를 수집한다. 원인 + 다음 행동이 모두 있으면 합격, 코드명이나 '오류가 발생했습니다'만 있으면 불합격.

### H61. 메뉴 항목에 추가 입력이 필요하면 말줄임표를 붙이고 제목은 15자 미만이다
- 근거: [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) — 추가 정보가 필요한 동작에는 말줄임표(…)를 붙인다; [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) — 제목은 짧게 한다(15자 미만).
- 판정: 더보기 메뉴 항목 중 모달·입력으로 이어지는 항목에 `…`가 있는지, 화면·모달 제목 글자 수가 15자 미만인지 센다.

### H62. 필드 라벨이 필수/선택 여부와 단위를 명시한다
- 근거: [Entering Data](https://developer.apple.com/design/human-interface-guidelines/entering-data) — "provide an introductory label that describes the information, like \"Email.\""; 필수 데이터는 사람이 알게 한다.
- 판정: 닉네임 라벨에 '(선택)' 표기, 시분초 필드에 '시·분·초' 단위가 값을 채운 상태에서도 읽히면 합격.

---

## 측정 절차 요약

1. 390px·1280px 라이트/다크/고대비 스크린샷 6장 + 320·768px·가로 모드 3장(H1, H9~H11, H17, H19).
2. DOM 스크립트 1회: 모든 텍스트 `font-size`/`font-weight`/`color`(H1~H4), 탭 요소 `getBoundingClientRect`(H51~H52), `inputmode`·`aria-live`·`disabled`(H27, H32, H36), `left` 정렬선(H15).
3. grep: hex/rgb 직접 사용(H7), 토큰 오용(H8), light weight(H3), `userAgent`(H17), `safe-area-inset`(H18), `prefers-reduced-motion`(H50).
4. 조작 녹화: 프리셋 10회 탭(H34, H47), 확인 적용 피드백 길이(H46), 모달 전환 중 입력(H48), 키보드 순회(H55), 실행 취소 2회(H38).
5. 흑백·reduce motion·키보드 동시 조건 종합 검사(H57).
