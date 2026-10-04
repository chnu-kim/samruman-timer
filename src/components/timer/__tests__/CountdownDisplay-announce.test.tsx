// @vitest-environment jsdom
// C072·W30: 임박·긴급 알림은 단계가 올라갈 때 한 번뿐이다. live region의 글자는 같은 문구를 다시 넣어도 그대로라
// 반복 여부를 볼 수 없으므로 알림 함수를 spy로 바꿔 부른 횟수를 센다
import { render, act } from "@testing-library/react";
import { CountdownDisplay } from "../CountdownDisplay";

const { announce } = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useAnnounce: () => announce }));

beforeEach(() => {
  vi.useFakeTimers();
  announce.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

function renderLarge(remainingSeconds: number) {
  const ui = (seconds: number, key = 0) => (
    <CountdownDisplay remainingSeconds={seconds} status="RUNNING" snapshotKey={key} size="large" />
  );
  const view = render(ui(remainingSeconds));
  return { update: (seconds: number, key?: number) => view.rerender(ui(seconds, key)) };
}

describe("임박 알림 반복 금지", () => {
  it("같은 단계 안에서는 폴링이 값을 다시 넣어도 다시 알리지 않는다", () => {
    const { update } = renderLarge(305);
    act(() => { vi.advanceTimersByTime(6_000); }); // 305 → 299
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith("남은 시간이 5분 미만입니다");

    // 폴링·다른 기기의 작은 변경이 같은 단계(5분 미만) 안의 값을 계속 넣는다
    update(298);
    update(290, 1);
    act(() => { vi.advanceTimersByTime(30_000); });
    update(262, 2);
    expect(announce).toHaveBeenCalledTimes(1);

    // 다음 단계(1분 미만)로 올라갈 때만 한 번 더
    act(() => { vi.advanceTimersByTime(203_000); }); // 262 → 59
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith("남은 시간이 1분 미만입니다");
    update(55, 3);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
