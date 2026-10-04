import { connectionLostAgo, isDisconnected, DISCONNECT_FAILURE_THRESHOLD } from "../connection-status";

describe("connection-status (C027)", () => {
  it("연속 실패 1회는 끊김이 아니고 2회부터 끊김", () => {
    expect(DISCONNECT_FAILURE_THRESHOLD).toBe(2);
    expect(isDisconnected(0)).toBe(false);
    expect(isDisconnected(1)).toBe(false);
    expect(isDisconnected(2)).toBe(true);
  });

  it("마지막 동기화로부터 지난 시간을 초·분·시간으로 붙인다", () => {
    const base = 1_000_000;
    expect(connectionLostAgo(base, base + 12_400)).toBe("12초 전 기준");
    expect(connectionLostAgo(base, base + 125_000)).toBe("2분 전 기준");
    expect(connectionLostAgo(base, base + 2 * 3600_000 + 5)).toBe("2시간 전 기준");
  });

  it("시각을 모르면 null, 시계가 뒤로 가도 음수를 내지 않는다", () => {
    expect(connectionLostAgo(null, 5)).toBeNull();
    expect(connectionLostAgo(10_000, 5_000)).toBe("0초 전 기준");
  });
});
