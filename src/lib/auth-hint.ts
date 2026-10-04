// 로그인 여부 힌트. 로그인 확인(/api/auth/me)이 끝나기 전에 그리는 첫 화면 골격이 로그아웃 방문자에게
// 시청자 모양(콘솔)·소개 줄 자리(목록)를 보이게 하려고 html[data-auth="in"|"out"]에 둔다.
// 세션 쿠키는 httpOnly라 서버·스크립트가 읽을 수 없으므로 지난 확인 결과를 localStorage에 남기고,
// 첫 페인트 전 인라인 스크립트(AUTH_HINT_INIT_SCRIPT)가 속성을 붙인다. 값이 없으면(첫 방문) 로그아웃으로 본다.
// 골격은 CSS(`signed-out:` 변형, globals.css)로만 갈라 하이드레이션 결과가 서버 마크업과 같다.
// 로드 도중에는 속성을 바꾸지 않는다. 확인 결과로 바로 바꾸면 보이던 골격이 다른 모양으로 바뀌며 밀리기 때문이다(다음 로드부터 반영)
const KEY = "signedIn";

export const AUTH_HINT_INIT_SCRIPT = `(function(){var v='out';try{if(localStorage.getItem('${KEY}')==='1')v='in';}catch(e){}document.documentElement.setAttribute('data-auth',v);})();`;

/** 로그인 확인 결과를 다음 로드의 힌트로 남긴다. 저장소를 쓸 수 없으면 조용히 넘어간다(힌트가 없으면 로그아웃 모양) */
export function rememberSignedIn(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // 사파리 개인 정보 보호 모드 등
  }
}
