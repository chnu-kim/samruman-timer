# 삼루먼타이머 UX/UI/시각 디자인 평가 기준표

## 0. 사용 규칙

- 근거 범위: 출처 검증을 통과한 근거 JSON(hci-foundations, visual-design, interaction, mobile-touch, a11y-color, streaming-glance-viz)만 쓴다. 근거에 없는 수치나 규칙은 기준으로 삼지 않는다. UX뿐 아니라 시각 디자인(Reinecke, Lindgaard, Tractinsky, Rosenholtz, Legge), UI 표준(WCAG 2.2, ARIA APG, Material), 시각화(Cleveland & McGill, Healey, Harrison) 근거를 함께 묶었다.
- 평가 대상 화면: `/projects/[id]` 조작 콘솔(데스크톱·모바일), 모바일 하단 즉시 적용 바, 키보드 숫자 단축키, OBS 오버레이 설정 모달, 오버레이 페이지, 시청자 공개 화면, 통계 페이지, 프로젝트 목록. 다크·라이트 두 테마.
- 측정 환경: Playwright로 뷰포트 390×844(모바일 기본), 320px(리플로우), 1280px(데스크톱) 캡처. `getBoundingClientRect()`로 크기·간격, `getComputedStyle()`로 색을 뽑아 WCAG 상대 휘도식으로 대비를 계산한다. CSS px→mm 환산은 `mm = px × DPR ÷ PPI × 25.4`로 기기별로 한다(예: PPI 460, DPR 3 기기에서 1mm ≈ 6.0 CSS px, 9.6mm ≈ 58px; 근거 streaming-glance-viz-05는 35~45 CSS px로 어림했으나 기기에 따라 달라 실측을 우선한다).
- 미적 평가와 과업 수행 평가는 분리한다(Tractinsky 2000). 보기 좋다는 이유로 사용성 위반을 통과시키지 않는다.

### 심각도 등급

| 등급 | 정의 |
|---|---|
| S1 치명 | 방송 중 시간이 잘못 바뀌거나 상태를 오해하게 하는 문제, 데이터가 복구 불가로 사라지는 문제, 입력 중 단축키 오작동 |
| S2 중대 | 빈번한 조작의 시간·오류를 늘리거나, 핵심 정보를 한눈에 못 읽게 하거나, WCAG AA 위반 |
| S3 경미 | 보조 정보·드문 조작의 효율 저하, 흐릿한 그룹화, 혼잡 |
| S4 권고 | AAA 수준 또는 방향성 근거만 있는 항목. 기록하되 수정 우선순위는 낮음 |

근거 강도 표기: [P] 동료 심사, [S] 표준(WCAG/ARIA), [G] 업계 가이드라인. 방향성 근거(수치를 그대로 옮기지 않는다고 JSON에 적힌 것)는 (방향)으로 표시한다.

---

## A. 방송 중 조작 효율·오류 방지

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| A1 | 가장 빈번한 흐름(닉네임→부호→값→적용)의 연산자 수가 가장 적은 경로가 기본 경로다. 즉시 적용 바·숫자 단축키는 기본 경로보다 연산자가 적어야 한다. | hci-foundations-12 [P] Card, Moran & Newell 1980; mobile-touch-09 [P] Oulasvirta 등 2005 (방향); streaming-glance-viz-04 [P] Mark 등 2008 (방향) | "시청자 A에게 +10분" 한 건을 K(키 입력)·P(포인팅)·M(정신적 준비)·눈 이동·확인 클릭으로 적어 개수를 센다. 데스크톱 기본 경로, 단축키 경로, 모바일 하단 바 경로 세 가지를 비교해 표로 만든다. 모바일에서는 탭 수와 화면 전환·스크롤 수도 센다. | 기본 경로가 단축키·바 경로보다 길면서 더 짧은 경로가 발견되지 않으면 S2. 한 건 처리에 스크롤이나 모달 전환이 필요하면 S2. |
| A2 | 시간 추가/차감 같은 빈번한 제어형 조작에는 확인 대화상자·의도적 지연이 없다. 되돌리기로 안전을 확보한다. | hci-foundations-07 [P] Norman 1983; hci-foundations-09 [P] Anderson 등 2015 (방향, 보안 경고 맥락); interaction-03 [P] Dabrowski & Munson 2011; interaction-05 [P] Adamczyk & Bailey 2004 | 모든 모달·confirm·토스트를 나열하고 각 동작을 제어형(즉시 반영)/대화형(지연 허용)으로 분류한 표를 만든다. +5분을 10회 반복해 같은 모양의 확인이 몇 번 뜨는지 센다. '확인' 버튼이 항상 같은 위치의 같은 문구인지 본다. | 시간 추가에 매번 모달 확인이 있으면 S2. 확인이 있어도 버튼 문구가 동작명('차감')이 아닌 '확인'이면 S3. |
| A3 | 잘못 적용한 변경 한 건을 한 번의 조작으로 되돌릴 수 있고, 그 수단이 화면에 보인다. 즉시 적용 바·단축키로 바꾼 것도 같은 수단으로 되돌린다. | hci-foundations-08 [P] Abowd & Dix 1992; hci-foundations-13 / a11y-color-08 [S] WCAG 2.2 SC 3.3.4; hci-foundations-07 [P] Norman 1983 | 변경 기록 행에 되돌리기 버튼이 있는지, 방금 변경에 대한 실행 취소가 있는지 DOM에서 확인한다. 각 시간 변경 수단(확인 버튼, 바, 단축키)에 대해 Reversible/Checked/Confirmed 중 무엇을 충족하는지 표로 적는다. 다른 기기에서 중간에 변경이 끼어들었을 때의 동작을 문구로 설명하는지 본다. | 되돌리기가 전혀 없고 반대 값을 다시 입력해야만 하면 S2. 즉시 적용 바·단축키가 세 가지 중 어느 것도 없이 서버 상태를 바꾸면 S2. |
| A4 | 추가/차감은 모드가 아니다. 모드(래칭 토글)로 둔다면 입력 지점 가까이에 색 외의 단서(부호·라벨·위치)로 상시 표시된다. 단축키는 포커스나 모달 상태에 따라 뜻이 바뀌지 않는다. | hci-foundations-05 [P] Norman 1983; hci-foundations-06 [P] Sellen, Kurtenbach & Buxton 1992; hci-foundations-10 [P] Norman 1983 | 추가/차감이 토글인지, 버튼 자체에 +/−가 박혀 있는지 확인한다. 토글이면 래칭 여부와 현재 모드가 입력칸·확인 버튼 옆에서 어떤 단서로 보이는지 캡처한다. 스크린샷을 흑백으로 바꿔 모드가 읽히는지 본다. 다른 탭에 1분 머문 뒤 돌아와 모드를 바로 읽을 수 있는지 사용성 점검 항목에 넣는다. 모달을 연 상태에서 숫자 키를 눌러 동작을 기록한다. | 래칭 토글이면서 색 하나로만 모드를 표시하면 S1(차감이 잘못 들어감). 모드 표시가 입력 지점에서 멀면 S2. 모달 열림 상태에서 단축키가 타이머를 바꾸면 S1. |
| A5 | 타이머 삭제·초기화·프로젝트 삭제처럼 되돌릴 수 없는 동작은 하기 어렵게 만들고, 되돌리기(소프트 삭제) 또는 동작명이 적힌 확인 중 하나를 둔다. | hci-foundations-07, -10 [P] Norman 1983; hci-foundations-13 / a11y-color-08 [S] WCAG 2.2 SC 3.3.4 | 파괴적 동작 목록을 만들고 각각 진입 경로(클릭 수), 확인 유무, 확인 문구, 복구 수단을 적는다. 파괴적 버튼이 빈번 버튼과 같은 크기·같은 줄에 인접해 있는지 측정한다. | 되돌리기도 확인도 없으면 S1. 확인은 있으나 문구가 '확인/예'이고 빈번 조작의 확인과 같은 모양이면 S2. 빈번 버튼과 인접(간격 15px 미만)하면 S2. |
| A6 | 가장 자주 쓰는 버튼(프리셋, 적용)이 보조 버튼보다 크고, 포인터·엄지의 기본 위치에서 가깝다. 오조작을 줄일 때는 거리를 줄이기보다 너비를 키운다. | hci-foundations-01 [P] MacKenzie 1992; hci-foundations-02 [P] Wobbrock 등 2008 | Playwright로 각 버튼의 bounding box를 뽑는다. 입력칸(또는 하단 바 중앙)을 기준점으로 거리 A와 너비 W를 재서 ID=log2(A/W+1)를 계산하고, ID 오름차순이 사용 빈도 내림차순과 맞는지 본다. 가장 작은 버튼의 너비를 적고 그것이 차감·적용인지 확인한다. | 빈도 1위 조작의 ID가 보조 조작보다 크면 S3. 차감·적용이 화면에서 가장 작은 축에 들면 S2. |
| A7 | 단축키가 있는 동작은 버튼에 키가 표시되고, 전체 목록을 한 곳에서 볼 수 있으며, 단축키 없이도 모든 기능을 쓸 수 있다. | interaction-07 [P] Lane 등 2005; Grossman 등 2007 | 프리셋·적용 버튼에 키 힌트(`<kbd>`)가 렌더되는지, 도움말(?) 진입이 있는지 DOM에서 확인한다. 마우스로 눌렀을 때 키를 상기시키는 장치가 있는지 본다. | 단축키가 있는데 화면 어디에도 표시되지 않으면 S3. 단축키로만 되는 기능이 있으면 S2. |
| A8 | 숫자 단축키는 닉네임·시분초 입력란에 포커스가 있을 때 작동하지 않는다. 끄거나 바꾸는 설정, 또는 포커스 범위 제한이 있다. | interaction-08 [S] WCAG 2.2 SC 2.1.4 | Playwright로 닉네임 입력란에 포커스를 두고 "1","5"를 타이핑한 뒤 타이머 값과 기록이 변하지 않는지 단언한다. 설정에 단축키 끄기가 있는지 본다. | 입력 중 타이머가 바뀌면 S1. 끄기·포커스 제한 둘 다 없고 단축키가 문서 전역이면 S2. |
| A9 | 각 입력의 초기값은 가장 흔한 올바른 선택과 같다. 되돌리기 어려운 방향(차감)이 기본이 아니다. | interaction-06 [P] Johnson & Goldstein 2003 (방향) | 추가/차감 초기 방향, 시분초 초기값, 프리셋 순서, 닉네임 초기 상태, 오버레이 설정 초기값을 표로 적고 변경 기록의 실제 분포(추가 비율, 흔한 분 값)와 비교한다. | 차감이 기본이면 S2. 매번 바꿔야 하는 초기값이 있으면 S3. |
| A10 | 자주 쓰는 값은 타이핑 대신 보이는 선택지(프리셋, 최근 닉네임)로 고른다. 시분초 입력이 외워야 하는 형식에 의존하지 않는다. | hci-foundations-11 [P] Nielsen 1994 (방향, 저자 주관 분류) | 같은 닉네임을 두 번째 입력할 때 자동완성·최근 목록이 뜨는지, 프리셋이 입력란 옆에 상시 보이는지 캡처한다. | 매번 전체 타이핑이 필요하면 S3. |
| A11 | 토스트·세션 만료 안내·오류·모달은 입력 도중에 뜨지 않고 입력이 끝난 뒤(과업 경계)로 미룬다. 포커스를 빼앗거나 레이아웃을 밀지 않는다. | interaction-04 [P] Bailey & Konstan 2006; Adamczyk & Bailey 2004; streaming-glance-viz-04 [P] Mark 등 2008 (방향) | 세션 만료를 강제한 상태에서 닉네임을 입력 중일 때 무엇이 뜨는지, 포커스가 어디로 가는지, 레이아웃 시프트가 있는지 Playwright로 기록한다. 폴링 갱신이 입력 중인 값을 지우지 않는지 확인한다. | 입력 중 포커스를 빼앗는 모달·자동 이동이 있으면 S2. 입력값이 갱신으로 지워지면 S1. |

## B. 정보 위계·한눈에 보기

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| B1 | 콘솔·시청자 화면을 블러 처리하거나 1초만 봐도 가장 큰 덩어리가 남은 시간임을 알 수 있다. | visual-design-02 [P] Lindgaard 등 2006; visual-design-01 [P] Reinecke 등 2013 | 390px·1280px 캡처에 가우시안 블러(반경 8~12px)를 적용해 가장 큰 시각 덩어리가 카운트다운인지 본다. 카운트다운 폰트 크기와 그다음 큰 텍스트의 비율을 잰다. | 블러 화면에서 카운트다운이 다른 요소와 구별되지 않으면 S2. |
| B2 | 정상/임박/종료 상태는 0.2초 안에 구분된다. 색조 하나의 미세 차이가 아니라 크기·위치·부호 등 두 번째 속성이 함께 바뀐다. 두 속성을 조합해야만 읽히는 표시는 없다. | streaming-glance-viz-02 [P] Healey, Booth & Enns 1996; streaming-glance-viz-09 [S] WCAG SC 1.4.1 | 세 상태를 각각 캡처해 나란히 놓고 흑백 변환 후에도 구별되는지 본다. 상태 차이를 만드는 CSS 속성을 나열한다. | 색조 차이만으로 상태를 표시하면 S2. |
| B3 | 입력 묶음(닉네임·부호·프리셋·시분초·적용) 안의 간격이 묶음과 다른 영역 사이 간격보다 분명히 작고, 같은 카드(공통 영역) 안에 있다. 기록 행 안 요소 간격이 행 사이 간격보다 작다. | visual-design-07 [P] Wagemans 등 2012 | bounding box로 묶음 내부 간격과 묶음 외부 간격을 재서 비율을 계산한다(내부:외부가 1:2 이상이면 뚜렷). 기록 행도 같은 방식. | 내부 간격이 외부 간격과 같거나 크면 S3. 입력 묶음이 두 카드로 갈라져 있으면 S2. |
| B4 | 첫 화면의 혼잡도에 상한을 둔다. 색을 쓰는 요소(추가/차감, 진행률, 그래프, 배지)가 많아 새 요소가 묻히면 혼잡이다. | visual-design-05 [P] Rosenholtz 등 2007; visual-design-06 [P] Baughan 등 2020; visual-design-01 [P] Reinecke 등 2013 | 첫 화면에서 서로 다른 강조색 수, 동시에 보이는 컨트롤 그룹 수, 색이 있는 비텍스트 요소 수를 센다. '새 항목을 하나 더 넣으면 눈에 띌까'를 평가자 2인이 판정한다. | 강조색이 4종 이상이고 카운트다운·입력·적용 외의 요소가 같은 시각 무게로 경쟁하면 S3. |
| B5 | 양을 읽어야 하는 그래프·진행률은 공통 기준선 위의 위치나 길이로 인코딩한다. 면적·각도·색 농도만으로 값을 비교하게 하지 않는다. | streaming-glance-viz-01 [P] Cleveland & McGill 1984 | 잔여 시간 그래프의 y축이 0에서 시작하는지, 진행률 막대가 눈금 없이도 비율로 읽히는지, 통계 페이지에 원형·면적 차트가 있는지 확인한다. | 수치 비교를 면적·색 농도에만 맡기면 S3. |
| B6 | 카운트다운은 시청 거리에 맞는 크기다. 두 번째 모니터·곁눈질 거리에서 x-height가 유창 범위(약 0.2°~2°) 안에 들고, 보조 텍스트도 하한을 지킨다. | visual-design-08 [P] Legge & Bigelow 2011; a11y-color-12 [P] Legge, Rubin & Luebker 1987 | 카운트다운·보조 텍스트의 렌더 px를 적고 모바일 40cm, 두 번째 모니터 70~100cm를 가정해 시각(度)으로 환산한다. 보조 텍스트는 하한(0.2°, 40cm에서 x-height 약 1.4mm) 근처인지 본다. | 두 번째 모니터 거리에서 카운트다운이 0.5° 미만이면 S2. 보조 텍스트가 하한 아래면 S3. |
| B7 | 폼 라벨은 입력란 위에 있고 한 행에 한 질문이다. 시분초 세 칸은 예외이되 각 칸에 단위 라벨이 붙어 있다. | interaction-12 [P] Seckler 등 2014 (지침 묶음 효과) | 콘솔 입력부, 오버레이 설정 모달, 프로젝트 생성 폼에서 라벨 위치와 한 행의 입력란 수를 센다. | 좌측 정렬 라벨·다단 배치가 설정 모달 전체에 걸쳐 있으면 S3. 시분초 칸에 단위가 없으면 S2. |
| B8 | 방송 중 필수 동작(추가/차감·적용)은 접힌 영역 안에 없다. 접어 둔 고급 옵션은 여는 단서가 보인다. | interaction-13 [P] Carroll & Carrithers 1984 (학습 단계 근거) | 첫 방문 상태의 컨트롤 수를 세고, 필수 동작까지의 클릭 수를 잰다. 접힘 토글의 가시성을 캡처한다. | 필수 동작이 접힌 영역 안에 있으면 S2. 접힘 단서가 없으면 S3. |
| B9 | 390px 첫 화면(스크롤 없이)에 남은 시간과 가장 빈번한 조작(즉시 적용 바 또는 프리셋)이 함께 보인다. | mobile-touch-09 [P] Oulasvirta 등 2005 (방향); streaming-glance-viz-13 [P] Lu 등 2018 (방향) | 390×844 캡처에서 카운트다운과 조작 바가 모두 뷰포트 안에 있는지 bounding box로 확인한다. 하단 바가 카운트다운을 가리지 않는지 본다. | 잔여 시간을 보려면 스크롤이 필요하면 S2. |

## C. 시각 디자인·미니멀·일관성

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| C1 | 첫 화면의 강조색 수와 컨트롤 그룹 수를 의도적으로 줄인다. 카운트다운·입력부·적용 버튼 외에 같은 시각 무게로 경쟁하는 요소가 없다. | visual-design-01 [P] Reinecke 등 2013; visual-design-05 [P] Rosenholtz 등 2007 | 콘솔·목록·통계 첫 화면의 강조색(배경·텍스트 기본색 제외) 수를 센다. 요소별 면적×대비로 시각 무게를 어림해 상위 3개를 적는다. | 상위 3개에 카운트다운이 없으면 S2. 강조색 5종 이상이면 S3. |
| C2 | 장식적 구분선, 반복 아이콘, 중복 라벨처럼 탐색을 늦추는 요소는 없다. | visual-design-06 [P] Baughan 등 2020 | 기록 목록·설정 모달에서 특정 항목(예: 폰트 설정)을 찾기까지 시선이 거치는 요소 수를 센다. 정보가 없는 장식 요소를 목록화한다. | 제거해도 정보 손실이 없는 장식이 한 화면에 5개 이상이면 S4. |
| C3 | (평가 절차) 미적 완성도와 과업 수행은 따로 채점한다. 미적 점수가 높아도 A·D·E 위반을 상쇄하지 않는다. | visual-design-03 [P] Tractinsky, Katz & Ikar 2000 | 평가서에 '미적 인상' 칸과 '과업 수행' 칸을 분리한다. | 해당 없음(절차 규칙). |
| C4 | 다크·라이트 테마는 같은 판독성을 갖는다. 다크 테마는 작은 보조 텍스트의 대비·크기를 라이트보다 넉넉히 잡고, 어두운 방을 가정한 저조도에서도 읽힌다. | visual-design-09 [P] Piepenbrock 등 2013; visual-design-10 [P] Dobres 등 2017; a11y-color-11 [P] Piepenbrock 등 2013 | 같은 화면을 두 테마로 캡처해 숫자·본문·12~14px 보조 텍스트의 대비와 크기를 표로 비교한다. 다크 테마 보조 텍스트가 4.5:1 미만인 항목을 센다. | 다크 테마 보조 텍스트가 라이트보다 낮은 대비·작은 크기면 S2. 어느 한 테마만 대비 미달이면 E1에 따라 S2. |
| C5 | 목표 진행률 막대의 값 변경 전이는 끝에서 멈추거나 되감기지 않고, 막대 폭이 항상 실제 비율과 일치한다. | streaming-glance-viz-11 [P] Harrison 등 2007 | 값을 바꾸며 transition 함수(easing)를 computed style에서 읽고, 애니메이션 중간 프레임을 캡처해 폭이 비율을 벗어나지 않는지 본다. | 끝 멈춤·되감기 easing이 있으면 S4. 비율 왜곡이 있으면 S2. |
| C6 | 카운트다운·진행 막대 위에 줄무늬 흐름·맥동 같은 장식 움직임을 의도 없이 넣지 않는다. 정확한 남은 시간은 정적 숫자가 주 정보다. | streaming-glance-viz-12 [P] Harrison, Yeo & Hudson 2010 (추론); streaming-glance-viz-10 / a11y-color-09 [S] WCAG SC 2.2.2 | 카운트다운 주변의 CSS animation·keyframes를 나열하고 각 지속 시간과 목적을 적는다. | 목적 설명 없이 5초 넘게 반복되는 장식 움직임이 있으면 S3. |
| C7 | 같은 기능은 같은 모양, 다른 기능은 다른 모양이다(일관성). 추가·차감·삭제처럼 결과가 다른 버튼이 같은 모양·같은 줄에 늘어서 있지 않다. | hci-foundations-10 [P] Norman 1983; hci-foundations-11 [P] Nielsen 1994 (일관성 18%, 방향) | 콘솔·모달·목록의 버튼 스타일을 기능별로 표로 모아 변형 수를 센다. 흑백 캡처에서 +와 −, 프리셋과 삭제가 구별되는지 본다. | 흑백에서 추가/차감이 같아 보이면 S1(A4와 동일 판정). 같은 기능에 세 가지 이상 모양이 섞이면 S3. |

## D. 모바일·터치

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| D1 | 한 손 엄지로 누르는 핵심 버튼(추가/차감, 프리셋, 적용, 하단 바)은 짧은 변이 약 9.2mm(단발) 이상, 연속으로 누르는 버튼(시분초 증감, 프리셋 연타)은 9.6mm 이상이다. | hci-foundations-03 / mobile-touch-01 / streaming-glance-viz-05 [P] Parhi, Karlson & Bederson 2006; mobile-touch-02 [P] 같은 논문 serial phase; mobile-touch-08 [G] Google Material 48dp | 390px 뷰포트에서 각 버튼의 bounding box를 뽑고 대상 기기 PPI·DPR로 mm 환산한다(위 0절 식). 연속 입력 UI(증감 버튼·키패드)는 따로 표시한다. | 핵심 버튼이 7.7mm 미만이면 S2(오류율 5%→12.9% 구간). 연속 입력 키가 9.6mm 미만이면 S2. 9.2~9.6mm 사이면 S4. |
| D2 | 방송 중 쓰는 모든 탭 대상(아이콘 버튼, 닫기, 삭제, 되돌리기 포함)은 8mm(약 30 CSS px) 미만이 없다. | mobile-touch-04 [P] Henze, Rukzio & Boll 2011 (게임 과제, 시간 압박) | 모바일에서 아이콘만 있는 버튼의 실제 터치 영역(padding 포함)을 잰다. | 차감·삭제·적용이 8mm 미만이면 S1. 그 밖의 버튼이 8mm 미만이면 S2. |
| D3 | 인접 버튼 사이 간격은 8px 이상이고, 결과가 반대인 버튼(추가와 차감)은 가장자리 간 15 CSS px(약 4mm) 이상 떨어지거나 크기·위치로 구분된다. | mobile-touch-08 [G] Material 8dp; mobile-touch-10 [P] Holz & Baudisch 2011 (4mm는 오프셋 수치이지 안전 간격 기준값이 아님); hci-foundations-02 [P] Wobbrock 등 2008 | 하단 바·프리셋 줄·추가/차감 쌍의 인접 가장자리 간격을 bounding box 차로 계산한다. | 추가/차감이 간격 0으로 붙어 있고 모양 구분도 없으면 S1. 프리셋 줄 간격 8px 미만이면 S3. |
| D4 | 화면 좌우 끝 8mm 이내에 붙은 주요 버튼은 중앙 버튼보다 크거나(9mm 이상) 좌우 여백이 있다. | mobile-touch-03 [P] Parhi 등 2006; Henze 등 2011 | 390px 캡처에서 x < 8mm 또는 x > (폭−8mm)에 걸치는 버튼을 찾고 크기를 중앙 버튼과 비교한다. | 가장자리 버튼이 중앙보다 작으면 S3. |
| D5 | 자주 쓰는 조작은 엄지 도달 영역(화면 아래~가운데) 안에 있고, 상단 모서리에만 있지 않다. | mobile-touch-05 [P] Bergstrom-Lehtovirta & Oulasvirta 2014 (mm 한계값 없음) | 390×844 캡처를 상·중·하 1/3로 나눠 추가/차감·적용·프리셋의 위치를 표시한다. 설정·오버레이 진입은 상단이어도 된다. | 빈번 조작이 상단 1/3에만 있으면 S3. |
| D6 | 320 CSS px 폭에서 가로 스크롤 없이 모든 정보와 기능을 쓸 수 있다. 그래프·표는 예외 여부를 따로 판단한다. | mobile-touch-11 [S] WCAG 2.2 SC 1.4.10 | 뷰포트 320px에서 `document.scrollingElement.scrollWidth > clientWidth`인 화면을 찾고 잘린 텍스트·가려진 버튼을 캡처한다. | 콘솔·목록·모달에서 가로 스크롤이 생기거나 버튼이 잘리면 S2. |
| D7 | 모바일에서 시간 추가 한 건은 한 번의 짧은 응시로 상태를 읽고 한두 번의 탭으로 끝난다. 스크롤·모달 전환이 끼지 않는다. | mobile-touch-09 [P] Oulasvirta 등 2005 (방향, 상대 비교) | 하단 바 경로와 콘솔 경로의 탭 수·스크롤 수·화면 전환 수를 센다(A1과 공유). | 한 건에 스크롤 또는 모달 전환이 2회 이상이면 S2. |

## E. 접근성

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| E1 | 모든 텍스트(카운트다운, 닉네임, 기록 날짜, 회색 보조 라벨, 프리셋 글자, placeholder)는 배경 대비 4.5:1 이상, 큰 글자(약 24px 이상 또는 18.5px 굵게)는 3:1 이상. 두 테마 모두. 비활성 버튼은 예외. | visual-design-11 / a11y-color-01 / streaming-glance-viz-06 [S] WCAG 2.2 SC 1.4.3 | 두 테마에서 텍스트 노드별 computed color·배경색을 수집해 대비를 계산한 표를 만든다(그라데이션·반투명은 실제 합성 색으로). | 카운트다운이 미달이면 S1. 그 밖의 텍스트 미달은 S2. |
| E2 | 입력창 경계, 프리셋 칩 경계, 선택·포커스 상태, 진행률 채움/트랙, 그래프 선·축은 인접 색과 3:1 이상. 반올림하지 않는다. | visual-design-12 / a11y-color-02 / streaming-glance-viz-07 [S] WCAG 2.2 SC 1.4.11 | 경계·채움·선 색과 인접 배경의 대비를 계산한다. 경계 없이 배경색 차이만으로 구분되는 입력창은 배경 간 대비로 판정한다. 값이 텍스트로 병기되면 그래픽은 필수 아님으로 메모한다. | 입력창·적용 버튼 경계가 3:1 미만이면 S2. 그래프·막대만 미달이고 수치가 병기되면 S3. |
| E3 | 추가/차감, 성공/오류, 달성/미달성, 선택/비선택, 그래프 계열은 색 외에 부호·아이콘·문구·위치로도 구분된다. 초록/빨강 쌍은 명도 차이도 둔다. | visual-design-14 / a11y-color-03 / streaming-glance-viz-09 [S] WCAG 2.2 SC 1.4.1; a11y-color-04 [P] Machado 등 2009 (시뮬레이터 근거) | 캡처를 흑백(채도 0)으로 바꾸고, Machado 모델 기반 제1·제2색약 시뮬레이션을 적용해 각 쌍이 구별되는지 본다. 기록 행에 +/− 부호가 텍스트로 있는지 DOM에서 확인한다. | 추가/차감이 색만으로 구분되면 S1(A4와 동일). 그 밖의 쌍은 S2. |
| E4 | 모든 포인터 대상은 24×24 CSS px 이상이거나 24px 원이 이웃과 겹치지 않는 간격이 있다(AA). 자주 쓰거나 되돌리기 어려운 조작은 44×44 CSS px 이상(AAA 권고). | hci-foundations-04 / visual-design-13 / mobile-touch-06 / a11y-color-07 / streaming-glance-viz-08 [S] WCAG 2.2 SC 2.5.8; mobile-touch-07 [S] WCAG 2.2 SC 2.5.5 (AAA) | 모든 button·a·role=button의 bounding box를 수집해 24px 미만 목록과 간격 예외 성립 여부를 적는다. 적용·차감·프리셋·하단 바·삭제는 44px 기준으로 따로 표시한다. | 24px 미만이고 예외도 없으면 S2. 빈번·파괴 조작이 44px 미만이면 S4(AAA)로 적되 D1·D2 판정과 합산한다. |
| E5 | Tab으로 순회하는 모든 요소에 포커스 링이 보이고, 링이 배경과 3:1 이상이다(두 테마). | a11y-color-05 [S] WCAG 2.2 SC 2.4.7; a11y-color-02 [S] SC 1.4.11 | Playwright로 Tab을 반복하며 `document.activeElement`의 outline/box-shadow를 읽고 각 단계 캡처를 남긴다. `outline: none`에 대체 스타일이 없는 요소를 찾는다. | 포커스 링이 없는 요소가 콘솔 입력 흐름 안에 있으면 S2. 그 밖은 S3. |
| E6 | 키보드 포커스를 받은 요소가 고정 하단 바·고정 헤더에 완전히(AA) 가려지지 않고, 가능하면 일부도(AAA) 가려지지 않는다. | a11y-color-06 [S] WCAG 2.2 SC 2.4.11, 2.4.12 | 390px에서 하단 바를 띄운 채 스크롤 하단의 기록 행 버튼·그래프 컨트롤에 Tab 포커스를 주고 bounding box가 바와 겹치는지 계산한다. `scroll-padding-bottom`이 바 높이 이상인지 본다. | 완전 가림이면 S2. 일부 가림이면 S4. |
| E7 | 시간 추가 성공, 기록 추가, 오류, 목표 달성 같은 상태 메시지는 `role=status`/`alert` 또는 `aria-live`로 포커스 이동 없이 보조기술에 전달된다. | interaction-09 [S] WCAG 2.2 SC 4.1.3 | DOM에서 토스트·상태 영역의 role/aria-live를 확인하고, 스크린리더(VoiceOver)로 입력 포커스를 유지한 채 안내가 읽히는지 본다. | 성공·오류 모두 live region이 없으면 S3. 오류만 없으면 S2. |
| E8 | 잘못된 입력(음수, 59 초과, 빈 값, 긴 닉네임, 0초)은 자동 감지되고, 무엇이 틀렸고 어떻게 고치는지 문구로 알리며, 오류 뒤에도 입력값이 남는다. | interaction-10 [S] WCAG 2.2 SC 3.3.3; [P] Seckler 등 2014 (묶음 효과) | 각 잘못된 값을 Playwright로 넣고 오류 문구 텍스트와 입력값 보존 여부를 단언한다. 세션 만료 뒤 재시도 시 입력이 남는지도 본다. | 오류 뒤 입력이 지워지면 S2. 문구가 '오류'처럼 수정 방법을 말하지 않으면 S3. |
| E9 | 시분초 입력란의 단위와 허용 범위는 입력 전부터 보인다(placeholder에만 의존하지 않음). 범위 오류를 막아야 하면 제한된 선택 컨트롤을 쓴다. | interaction-11 [P] Seckler 등 2014 (지침 12, 13) | 입력란 옆·안의 단위 라벨, 범위 안내가 placeholder 외 요소로 렌더되는지 DOM에서 본다. 분에 90을 넣었을 때의 동작(거부/환산)이 사전 안내와 일치하는지 확인한다. | 단위가 placeholder에만 있으면 S3. 90분 입력이 조용히 다른 값으로 바뀌면 S2. |
| E10 | 접고 펴는 영역(설정 모달 고급 옵션, 기록 더보기, 고급 입력)은 `button`이고 `aria-expanded`가 상태와 일치하며 Enter·Space로 토글된다. | a11y-color-10 [G] WAI-ARIA APG Disclosure | 접힘 토글의 태그·role·aria-expanded를 DOM에서 읽고 키보드로 토글해 값 변화를 단언한다. | div+onClick이거나 aria-expanded가 없으면 S3. |
| E11 | 자동 시작해 5초 넘게 움직이는 장식 요소는 끌 수 있거나 `prefers-reduced-motion`에 반응한다. 카운트다운 갱신 자체는 필수 예외다. | a11y-color-09 / streaming-glance-viz-10 [S] WCAG 2.2 SC 2.2.2 | `animation-iteration-count: infinite`인 요소를 나열하고 reduced-motion 미디어 쿼리 적용 여부를 확인한다. | 끌 수 없는 무한 장식 애니메이션이 있으면 S3. |
| E12 | (교차) 단축키 범위 제한은 A8, 데이터 변경의 Reversible/Checked/Confirmed는 A3·A5로 판정한다. | interaction-08, a11y-color-08 [S] | — | A8·A3·A5 참조. |

## F. 피드백·상태·신뢰

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| F1 | 적용·프리셋·하단 바를 누르면 약 0.1초 안에 눌림 상태나 낙관적 반영이 보이고, 서버 확정이 1초를 넘기면 전송 중 표시가 있다. 느린 네트워크에서도 같다. | interaction-01 [P] Card, Robertson & Mackinlay 1991 (자기 시스템 설계 목표); interaction-03 [P] Dabrowski & Munson 2011 | Playwright로 클릭 시각과 첫 DOM 변화(클래스·텍스트) 시각의 차를 잰다. 네트워크를 3G로 제한하고 1초 넘는 구간에 전송 중 표시가 있는지 캡처한다. | 느린 네트워크에서 1초 넘게 아무 표시가 없으면 S2. 눌림 피드백이 없으면 S3. |
| F2 | 1초를 넘길 수 있는 비동기 동작(통계·그래프 로딩, 목록 로딩, 설정 저장, 재시도)에는 스켈레톤이나 진행 표시가 있고, 멈춘 상태와 구별된다. | interaction-02 [P] Myers 1985 (몇 초~십수 초 대기 맥락) | 각 비동기 동작을 지연시켜 로딩 표시의 유무와 움직임(정지 아님)을 캡처한다. | 로딩 표시가 없어 빈 화면이 1초 넘게 보이면 S3. |
| F3 | 네트워크 끊김·세션 만료·폴링 실패 때 카운트다운이 마지막 값에서 멈춘 채 정상처럼 보이지 않는다. '일시정지'와 '연결 끊김/오류'는 다른 표시다. 복구 후 별도 조작 없이 정상으로 돌아온다. | streaming-glance-viz-03 [P] Matthews, Rattenbury & Carter 2007; hci-foundations-05 [P] Norman 1983 | 오프라인 모드로 전환해 30초 뒤 콘솔·오버레이를 캡처하고, 일시정지 상태 캡처와 나란히 비교한다. 온라인 복귀 후 자동 복구를 확인한다. | 끊김이 정상과 같은 모습이면 S1. 일시정지와 끊김이 같은 표시면 S2. 복구에 새로고침이 필요하면 S2. |
| F4 | 변경이 적용되면 카운트다운과 변경 기록이 함께 갱신되어 요청이 들렸고 처리됐음이 드러난다. 실패 시 무엇이 실패했고 재시도 방법이 있는지 알린다. | interaction-02 [P] Myers 1985; interaction-10 [S] WCAG SC 3.3.3 | +10분 적용 후 카운트다운·기록 행·목표 진행률이 같은 폴링 주기 안에 바뀌는지 본다. 서버를 500으로 만들어 실패 문구와 재시도 수단을 캡처한다. | 실패가 조용히 삼켜지면 S1. 성공 반영이 기록과 카운트다운 중 한쪽만 되면 S2. |
| F5 | (교차) 모드 상태 피드백은 A4, 상태 메시지의 보조기술 전달은 E7, 미적 품질이 신뢰에 주는 영향은 C3·C4로 판정한다. | hci-foundations-05, interaction-09, visual-design-03 | — | 참조. |

## G. 시청자·오버레이 관점

| ID | 기준 | 근거 | 확인 방법 | 위반 시 심각도 |
|---|---|---|---|---|
| G1 | 시청자 공개 화면은 모바일 기준으로 먼저 설계한다. 375px 안팎에서 남은 시간·목표·최근 기록이 가로 스크롤 없이 첫 화면에 보인다. | streaming-glance-viz-13 [P] Lu 등 2018 (중국 설문, 방향); mobile-touch-11 [S] WCAG SC 1.4.10 | 375×812에서 공개 화면을 캡처해 세 요소의 bounding box가 뷰포트 안에 있는지, scrollWidth가 넘치지 않는지 확인한다. | 남은 시간이 첫 화면 밖이면 S2. 가로 스크롤이 생기면 S2. |
| G2 | 오버레이 텍스트는 방송 영상 위에서도 읽힌다. 밝은·어두운 배경 모두에서 4.5:1(큰 글자 3:1)을 확보하는 외곽선·그림자·배경판이 있다. 큰 숫자보다 작은 보조 텍스트의 대비를 더 높게 둔다. | streaming-glance-viz-06 [S] WCAG SC 1.4.3; a11y-color-12 [P] Legge, Rubin & Luebker 1987 | 오버레이를 흰색·검정·중간 회색·실제 게임 캡처 위에 올려 네 장을 만들고 각각 대비를 계산한다. 보조 텍스트 대비가 큰 숫자보다 낮은지 비교한다. | 흰 또는 검정 배경에서 숫자가 안 읽히면 S1. 보조 텍스트가 큰 숫자보다 낮은 대비면 S3. |
| G3 | 오버레이는 폴링 실패·서버 오류 때 마지막 값에 멈춰 정상처럼 보이지 않고, 복구되면 자동으로 돌아온다. 방송 화면이므로 오류 표시는 시청자에게 과하지 않게 한다. | streaming-glance-viz-03 [P] Matthews 등 2007 | 오버레이를 연 채 서버를 끊고 30초·2분 후 캡처한다. 서버 복구 후 조작 없이 갱신되는지 확인한다. | 멈춤이 정상과 구별되지 않으면 S1. 복구에 OBS 새로고침이 필요하면 S2. |
| G4 | 시청자 닉네임별 추가 시간을 순위나 강조로 드러내는 표시(상위 후원자, 금액 강조)는 스트리머가 노출 수준을 끌 수 있다. 소액 기여도 같은 시각 비중으로 기록된다. | streaming-glance-viz-14 [P] Lu 등 2018 (질적 근거) | 기록·오버레이·통계에서 금액·시간 순 정렬, 상위 N 강조, 크기 차등이 있는지 보고 끄는 설정이 있는지 확인한다. | 끌 수 없는 순위·강조 표시가 오버레이에 있으면 S3. |
| G5 | 오버레이의 시간 추가 연출·목표 달성 연출은 짧게 끝나고(5초 이내 권고), 카운트다운 숫자 판독을 가리지 않으며, 진행 막대 위에 시간 지각을 바꾸는 장식 움직임이 없다. | streaming-glance-viz-10 [S] WCAG SC 2.2.2; streaming-glance-viz-12 [P] Harrison, Yeo & Hudson 2010 (추론); streaming-glance-viz-11 [P] Harrison 등 2007 | `src/lib/overlay-animation.ts`의 지속 시간을 읽고 연출 중 카운트다운이 가려지는 프레임을 캡처한다. | 연출이 숫자를 가리면 S2. 5초 넘게 반복되면 S3. |
| G6 | 오버레이·시청자 화면의 진행 막대는 길이로 비율을 전달하고 수치를 병기한다. 상태(임박)는 색 외에 크기·부호로도 보인다. | streaming-glance-viz-01 [P] Cleveland & McGill 1984; streaming-glance-viz-02 [P] Healey 등 1996; streaming-glance-viz-09 [S] WCAG SC 1.4.1 | 흑백 캡처에서 임박 상태가 구별되는지, 막대 옆에 숫자가 있는지 확인한다. | 임박 상태가 색만으로 표시되면 S2. |
| G7 | 시청자가 링크로 처음 여는 화면은 블러·1초 노출에서도 남은 시간이 중심임을 알 수 있고, 강조색·요소 수가 적다. | visual-design-02 [P] Lindgaard 등 2006; visual-design-01 [P] Reinecke 등 2013 | B1·C1과 같은 방법을 공개 화면에 적용한다. | B1·C1과 같은 판정. |

---

## H. 근거 충돌과 저울질

| # | 충돌 | 저울질 |
|---|---|---|
| H1 | 미니멀·혼잡 억제(C1, C2, B4; Reinecke 2013, Rosenholtz 2007, Baughan 2020) vs 발견 가능성·인식 우선(A7 단축키 힌트, A10 보이는 선택지, E9 형식 사전 안내; Lane 2005, Grossman 2007, Nielsen 1994, Seckler 2014) | 빈도와 치명도로 우선순위를 매긴다. 방송 중 매 건 쓰는 조작(프리셋, 적용, 단축키)의 힌트는 상시 노출하고, 드문 설정의 안내는 접는다. 힌트는 크기를 줄이되 대비는 E1(4.5:1)을 지킨다. 힌트는 입력부 안(공통 영역)에 두어 그룹 수를 늘리지 않는다(B3). 요소 수가 늘어나는 비용은 '강조색 수'로 재서, 힌트가 새 색을 더하지 않으면 혼잡으로 세지 않는다. |
| H2 | 빈번 조작에 확인 없음(A2; Norman 1983, Anderson 2015, Adamczyk & Bailey 2004) vs WCAG 3.3.4의 Reversible/Checked/Confirmed 중 하나(A3, A5) | 3.3.4는 세 가지 중 하나면 되므로 Confirmed 대신 Reversible(한 번의 되돌리기)을 택한다. 확인 대화상자는 되돌릴 수 없는 삭제·초기화에만 두고, 그때도 동작명을 버튼 문구로 쓴다. 즉시 적용 바·단축키는 되돌리기가 있어야 A2를 통과한 것으로 본다. |
| H3 | 큰 터치 타깃(D1, D2, E4; Parhi 2006, Henze 2011, WCAG 2.5.5) vs 390px 첫 화면에 남은 시간과 조작을 함께 담기(B9, D7; Oulasvirta 2005) | 빈도 상위 조작(프리셋 2~3개, 적용, 되돌리기)만 9.6mm급으로 키우고 나머지는 접거나 두 번째 화면으로 보낸다(B8). 하단 바를 화면 아래 고정하면 도달 영역(D5)과 첫 화면 요건을 동시에 만족하되, 바가 콘텐츠를 가리지 않도록 E6의 scroll-padding을 둔다. 크기를 줄여서 더 담는 선택은 하지 않는다(Wobbrock 2008: 너비가 오류를 더 좌우). |
| H4 | 양극성(라이트)의 판독 이점(C4; Piepenbrock 2013, Dobres 2017) vs 어두운 방송 환경에서 다크 테마를 쓰는 관행 | 근거는 라이트가 우월하다고 말할 뿐 다크를 기본으로 하라고도, 하지 말라고도 하지 않는다. 다크를 기본값으로 둘지는 이 근거로 정하지 않고 사용자 선택에 맡기되, 다크 테마의 작은 글자 대비·크기를 라이트보다 넉넉히 잡는 것으로 보상한다. 두 테마 모두 E1·E2를 통과해야 한다. |
| H5 | 전주의 처리로 상태를 색조 하나로 빠르게 구분(B2; Healey 1996) vs 색만으로 구분 금지(E3; WCAG 1.4.1, Machado 2009) | 색은 쓰되 유일 수단이 아니게 한다. 색조 차이는 크게(전주의 유지) 두고, 동시에 크기·부호·위치를 바꿔 색각 이상 사용자와 흑백 캡처에서도 읽히게 한다. 두 속성이 '모두 바뀌는' 것은 결합 탐색이 아니므로 B2의 금지 대상이 아니다. |
| H6 | 단계적 노출·학습 보호(B8; Carroll & Carrithers 1984) vs 숙련자의 단계 최소화(A1; Card 1980) | Carroll의 근거는 학습 단계에 한정된다. 첫 방문에는 보조 기능(그래프, 고급 입력)을 접고, 방송 중 필수 조작은 절대 접지 않는다. 접힘 상태를 기억해 숙련자가 매번 펴지 않게 한다. |
| H7 | 즉각 반응·눌림·낙관적 반영 애니메이션(F1; Card 1991) vs 움직임 제한·시간 지각 왜곡 방지(E11, C6; WCAG 2.2.2, Harrison 2010) | 피드백 애니메이션은 짧게(1초 이내) 한 번만 재생하고 반복하지 않는다. 카운트다운 숫자와 진행 막대 자체에는 장식 움직임을 얹지 않고, 피드백은 버튼·토스트 쪽에서 한다. reduced-motion에서는 색·텍스트 변화로 대체한다. |
| H8 | 모드 제거(A4; Norman 1983, Sellen 1992: 부호를 박은 +버튼·−버튼으로 분리) vs 버튼 수 증가로 혼잡(B4, C1) | 모드 오류는 S1이고 혼잡은 S3이므로 모드 제거를 우선한다. 버튼 수 증가는 차감 프리셋을 추가 프리셋보다 적게 두고(빈도 비례, A9), 차감을 모양·위치로 분리해 보상한다. |
| H9 | 모바일 즉시 적용(확인 없음, A2·D7) vs 시간 압박·오탭 오류율(D2; Henze 2011: 8mm 미만 40% 이상) | 즉시 적용은 유지하되 크기(D1 9.6mm)·간격(D3)·되돌리기(A3)를 묶음 조건으로 둔다. 셋 중 하나라도 빠지면 즉시 적용 바를 S2로 판정한다. |
| H10 | 인쇄·실험실 수치(Legge 2011, Parhi 2006, Myers 1985, Oulasvirta 2005)를 방송 상황에 옮기는 외삽 | 수치는 하한선 참고로만 쓰고, 판정은 '방향'으로 적는다. 방송 특유의 이중 과업·시간 압박은 수치를 더 보수적으로(더 크게, 더 높은 대비로) 적용할 이유로만 삼는다. |

---

## I. 출처 목록

1. Abowd, G. D., & Dix, A. J. (1992). Giving undo attention. Interacting with Computers, 4(3), 317-342. https://www.alandix.com/academic/papers/undo92/undo92.html
2. Adamczyk, P. D., & Bailey, B. P. (2004). If not now, when? The effects of interruption at different moments within task execution. CHI '04, 271-278. https://experts.illinois.edu/en/publications/if-not-now-when-the-effects-of-interruption-at-different-moments-/
3. Anderson, B. B., Kirwan, C. B., Jenkins, J. L., Eargle, D., Howard, S., & Vance, A. (2015). How polymorphic warnings reduce habituation in the brain: Insights from an fMRI study. CHI '15, 2883-2892. https://scholarsarchive.byu.edu/facpub/9306/
4. Bailey, B. P., & Konstan, J. A. (2006). On the need for attention-aware systems. Computers in Human Behavior, 22(4), 685-708. https://doi.org/10.1016/j.chb.2005.12.009
5. Baughan, A., August, T., Yamashita, N., & Reinecke, K. (2020). Keep it Simple: How Visual Complexity and Preferences Impact Search Efficiency on Websites. CHI 2020. https://dl.acm.org/doi/abs/10.1145/3313831.3376849
6. Bergstrom-Lehtovirta, J., & Oulasvirta, A. (2014). Modeling the functional area of the thumb on mobile touchscreen surfaces. CHI '14, 1991-2000. http://www.netlab.tkk.fi/~oulasvir/pubs/paper2117.pdf
7. Card, S. K., Moran, T. P., & Newell, A. (1980). The keystroke-level model for user performance time with interactive systems. CACM, 23(7), 396-410. https://doi.org/10.1145/358886.358895
8. Card, S. K., Robertson, G. G., & Mackinlay, J. D. (1991). The information visualizer, an information workspace. CHI '91, 181-188. https://dl.acm.org/doi/10.1145/108844.108874
9. Carroll, J. M., & Carrithers, C. (1984). Training wheels in a user interface. CACM, 27(8), 800-806. https://dl.acm.org/doi/10.1145/358198.358218
10. Cleveland, W. S., & McGill, R. (1984). Graphical Perception. JASA, 79(387), 531-554. http://faculty.washington.edu/aragon/classes/hcde511/s12/readings/cleveland84.pdf
11. Dabrowski, J., & Munson, E. V. (2011). 40 years of searching for the best computer system response time. Interacting with Computers, 23(5), 555-564. https://doi.org/10.1016/j.intcom.2011.05.008
12. Dobres, J., Chahine, N., & Reimer, B. (2017). Effects of ambient illumination, contrast polarity, and letter size on text legibility under glance-like reading. Applied Ergonomics, 60, 68-73. https://doi.org/10.1016/j.apergo.2016.11.001
13. Google. Android Accessibility Help: Touch target size. https://support.google.com/accessibility/android/answer/7101858?hl=en
14. Grossman, T., Dragicevic, P., & Balakrishnan, R. (2007). Strategies for accelerating on-line learning of hotkeys. CHI '07, 1591-1600. (Lane 등 2005 항목과 함께 인용)
15. Harrison, C., Amento, B., Kuznetsov, S., & Bell, R. (2007). Rethinking the Progress Bar. UIST 2007, 115-118. https://chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf
16. Harrison, C., Yeo, Z., & Hudson, S. E. (2010). Faster Progress Bars. CHI 2010, 1545-1548. https://chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf
17. Healey, C. G., Booth, K. S., & Enns, J. T. (1996). High-Speed Visual Estimation Using Preattentive Processing. ACM TOCHI, 3(2), 107-135. https://ics.uci.edu/~majumder/vispercep/preattentiveproc.pdf
18. Henze, N., Rukzio, E., & Boll, S. (2011). 100,000,000 taps: analysis and improvement of touch performance in the large. MobileHCI '11. https://nhenze.net/uploads/100000000-Taps-Analysis-and-Improvement-of-Touch-Performance-in-the-Large.pdf
19. Holz, C., & Baudisch, P. (2011). Understanding touch. CHI '11, 2501-2510. https://static.siplab.org/papers/chi2011-understanding_touch.pdf
20. Johnson, E. J., & Goldstein, D. (2003). Do defaults save lives? Science, 302(5649), 1338-1339. https://doi.org/10.1126/science.1091721
21. Lane, D. M., Napier, H. A., Peres, S. C., & Sándor, A. (2005). Hidden costs of graphical user interfaces. Int. J. Human-Computer Interaction, 18(2), 133-144. http://www.ruf.rice.edu/~lane/papers/hidden_costs.pdf
22. Legge, G. E., & Bigelow, C. A. (2011). Does print size matter for reading? Journal of Vision, 11(5):8. https://jov.arvojournals.org/article.aspx?articleid=2191906
23. Legge, G. E., Rubin, G. S., & Luebker, A. (1987). Psychophysics of reading-V. The role of contrast in normal vision. Vision Research, 27(7), 1165-1177. https://doi.org/10.1016/0042-6989(87)90028-9
24. Lindgaard, G., Fernandes, G., Dudek, C., & Brown, J. (2006). Attention web designers: You have 50 milliseconds to make a good first impression! Behaviour & Information Technology, 25(2), 115-126. https://doi.org/10.1080/01449290500330448
25. Lu, Z., Xia, H., Heo, S., & Wigdor, D. (2018). You Watch, You Give, and You Engage: A Study of Live Streaming Practices in China. CHI 2018. https://arxiv.org/abs/1803.06032
26. Machado, G. M., Oliveira, M. M., & Fernandes, L. A. F. (2009). A Physiologically-based Model for Simulation of Color Vision Deficiency. IEEE TVCG, 15(6), 1291-1298. https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
27. MacKenzie, I. S. (1992). Fitts' law as a research and design tool in human-computer interaction. Human-Computer Interaction, 7, 91-139. https://www.yorku.ca/mack/hci1992.html
28. Mark, G., Gudith, D., & Klocke, U. (2008). The Cost of Interrupted Work: More Speed and Stress. CHI 2008. https://ics.uci.edu/~gmark/chi08-mark.pdf
29. Matthews, T., Rattenbury, T., & Carter, S. (2007). Defining, Designing, and Evaluating Peripheral Displays. Human-Computer Interaction, 22(1), 221-261. http://www.madpickle.net/scott/pubs/hci_journal_submission_peripheral_activitytheory.pdf
30. Myers, B. A. (1985). The importance of percent-done progress indicators for computer-human interfaces. CHI '85, 11-17. https://www.cs.cmu.edu/~bam/papers/percentdoneCHI85.pdf
31. Nielsen, J. (1994). Enhancing the explanatory power of usability heuristics. CHI '94, 152-158. https://static.aminer.org/pdf/PDF/000/089/679/enhancing_the_explanatory_power_of_usability_heuristics.pdf
32. Norman, D. A. (1983). Design rules based on analyses of human error. CACM, 26(4), 254-258. https://simson.net/ref/1983/norman83.pdf
33. Oulasvirta, A., Tamminen, S., Roto, V., & Kuorelahti, J. (2005). Interaction in 4-second bursts. CHI '05, 919-928. https://www.interruptions.net/literature/Oulasvirta-CHI05-p919-oulasvirta.pdf
34. Parhi, P., Karlson, A. K., & Bederson, B. B. (2006). Target size study for one-handed thumb use on small touchscreen devices. MobileHCI '06, 203-210. http://www.cs.umd.edu/hcil/trs/2006-11/2006-11.pdf
35. Piepenbrock, C., Mayr, S., Mund, I., & Buchner, A. (2013). Positive display polarity is advantageous for both younger and older adults. Ergonomics, 56(7), 1116-1124. https://pubmed.ncbi.nlm.nih.gov/23654206/
36. Reinecke, K., Yeh, T., Miratrix, L., Mardiko, R., Zhao, Y., Liu, J., & Gajos, K. Z. (2013). Predicting users' first impressions of website aesthetics. CHI 2013. https://dl.acm.org/doi/10.1145/2470654.2481281
37. Rosenholtz, R., Li, Y., & Nakano, L. (2007). Measuring visual clutter. Journal of Vision, 7(2):17. https://jov.arvojournals.org/article.aspx?articleid=2122001
38. Seckler, M., Heinz, S., Bargas-Avila, J. A., Opwis, K., & Tuch, A. N. (2014). Designing usable web forms. CHI '14, 1275-1284. https://research.google/pubs/designing-usable-web-forms-empirical-evaluation-of-web-form-improvement-guidelines/
39. Sellen, A. J., Kurtenbach, G. P., & Buxton, W. A. S. (1992). The prevention of mode errors through sensory feedback. Human-Computer Interaction, 7(2), 141-164. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/sellen-kurtenbach-buxton-1992.pdf
40. Tractinsky, N., Katz, A. S., & Ikar, D. (2000). What is beautiful is usable. Interacting with Computers, 13(2). https://doi.org/10.1016/S0953-5438(00)00031-X
41. W3C (2023). WCAG 2.2, Understanding SC 1.4.1 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
42. W3C (2023). WCAG 2.2, Understanding SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
43. W3C (2023). WCAG 2.2, Understanding SC 1.4.10 Reflow. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
44. W3C (2023). WCAG 2.2, Understanding SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
45. W3C (2023). WCAG 2.2, Understanding SC 2.1.4 Character Key Shortcuts. https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html
46. W3C (2023). WCAG 2.2, Understanding SC 2.2.2 Pause, Stop, Hide. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
47. W3C (2023). WCAG 2.2, Understanding SC 2.4.7 Focus Visible. https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
48. W3C (2023). WCAG 2.2, Understanding SC 2.4.11 Focus Not Obscured (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
49. W3C (2023). WCAG 2.2, Understanding SC 2.5.5 Target Size (Enhanced). https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
50. W3C (2023). WCAG 2.2, Understanding SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
51. W3C (2023). WCAG 2.2, Understanding SC 3.3.3 Error Suggestion. https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html
52. W3C (2023). WCAG 2.2, Understanding SC 3.3.4 Error Prevention (Legal, Financial, Data). https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html
53. W3C (2023). WCAG 2.2, Understanding SC 4.1.3 Status Messages. https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
54. W3C WAI. ARIA Authoring Practices Guide, Disclosure (Show/Hide) Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
55. Wagemans, J., Elder, J. H., Kubovy, M., Palmer, S. E., Peterson, M. A., Singh, M., & von der Heydt, R. (2012). A century of Gestalt psychology in visual perception: I. Psychological Bulletin, 138(6), 1172-1217. https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/
56. Wobbrock, J. O., Cutrell, E., Harada, S., & MacKenzie, I. S. (2008). An error model for pointing based on Fitts' law. CHI '08. https://www.microsoft.com/en-us/research/publication/an-error-model-for-pointing-based-on-fitts-law/
