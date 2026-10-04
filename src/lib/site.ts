// 검색엔진·SNS 미리보기에 쓰는 사이트 절대 주소.
// BASE_URL은 프로덕션에서 런타임 시크릿이라 빌드 때 프리렌더되는 metadata·robots·sitemap에서는 읽을 수 없다
// (빌드 환경의 .env 값 http://localhost:3000이 그대로 박힌다). 도메인을 바꾸면 여기도 함께 고친다.
export const SITE_URL = "https://samrumantimer.chanwoos-account.workers.dev";

export const SITE_NAME = "삼루먼타이머";

// 중간 layout이 title을 문자열로 두면 그 아래 세그먼트에는 템플릿이 전해지지 않으므로
// 하위 페이지가 있는 layout은 이 템플릿을 다시 선언한다
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

// 공개 소개 문구라 플랫폼 이름(CHZZK)을 넣지 않는다. 로그인 버튼 라벨만 예외다.
// 로그인 화면은 앞 문장을 제목으로, 뒷 문장을 부제로 나눠 쓴다
export const SITE_TAGLINE = "스트리머를 위한 시간 추가형 타이머";
export const SITE_SUMMARY = "후원에 맞춰 방송 시간을 늘리고 OBS 오버레이로 시청자에게 보여 줍니다.";
export const SITE_DESCRIPTION = `${SITE_TAGLINE}. ${SITE_SUMMARY}`;
