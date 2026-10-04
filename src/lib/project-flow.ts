// 프로젝트와 타이머는 1:1이다. 목록에서 프로젝트를 만들면 상세 화면으로 이 플래그를 붙여 보내고,
// 상세 화면은 소유자에게 타이머 만들기 창을 바로 연 뒤 플래그를 지운다(새로고침·뒤로 가기로 다시 열리지 않게).
export const NEW_TIMER_PARAM = "new=timer";

/** 현재 주소에 플래그가 있으면 지우고 true를 돌려준다. 한 번만 쓰이도록 읽는 즉시 지운다 */
export function consumeNewTimerFlag(): boolean {
  const params = new URLSearchParams(window.location.search);
  const [key, value] = NEW_TIMER_PARAM.split("=");
  if (params.get(key) !== value) return false;
  params.delete(key);
  const qs = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  return true;
}
