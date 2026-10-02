import { hasExternalChange, reconcilePolledTimer } from "../timer-sync";

describe("hasExternalChange (UX-35)", () => {
  const t0 = 1_000_000;

  it("RUNNING에서 흐른 시간만큼만 줄었으면 변경 없음", () => {
    const local = { status: "RUNNING" as const, remainingSeconds: 3600, syncedAtMs: t0 };
    expect(hasExternalChange(local, { status: "RUNNING", remainingSeconds: 3595 }, t0 + 5_000)).toBe(false);
  });

  it("초 단위 오차(1~2초)는 변경으로 보지 않는다", () => {
    const local = { status: "RUNNING" as const, remainingSeconds: 3600, syncedAtMs: t0 };
    expect(hasExternalChange(local, { status: "RUNNING", remainingSeconds: 3593 }, t0 + 5_000)).toBe(false);
    expect(hasExternalChange(local, { status: "RUNNING", remainingSeconds: 3597 }, t0 + 5_000)).toBe(false);
  });

  it("기대값보다 3초 이상 벌어지면 다른 기기의 변경으로 본다 (경계)", () => {
    const local = { status: "RUNNING" as const, remainingSeconds: 3600, syncedAtMs: t0 };
    expect(hasExternalChange(local, { status: "RUNNING", remainingSeconds: 3598 }, t0 + 5_000)).toBe(true);
    expect(hasExternalChange(local, { status: "RUNNING", remainingSeconds: 3595 + 3600 }, t0 + 5_000)).toBe(true);
  });

  it("상태가 바뀌면 (만료, 활성화) 변경으로 본다", () => {
    const running = { status: "RUNNING" as const, remainingSeconds: 3, syncedAtMs: t0 };
    expect(hasExternalChange(running, { status: "EXPIRED", remainingSeconds: 0 }, t0 + 5_000)).toBe(true);

    const scheduled = { status: "SCHEDULED" as const, remainingSeconds: 3600, syncedAtMs: t0 };
    expect(hasExternalChange(scheduled, { status: "RUNNING", remainingSeconds: 3600 }, t0 + 5_000)).toBe(true);
  });

  it("SCHEDULED·EXPIRED는 시간이 흘러도 값이 같으면 변경 없음", () => {
    const scheduled = { status: "SCHEDULED" as const, remainingSeconds: 3600, syncedAtMs: t0 };
    expect(hasExternalChange(scheduled, { status: "SCHEDULED", remainingSeconds: 3600 }, t0 + 60_000)).toBe(false);

    const expired = { status: "EXPIRED" as const, remainingSeconds: 0, syncedAtMs: t0 };
    expect(hasExternalChange(expired, { status: "EXPIRED", remainingSeconds: 0 }, t0 + 60_000)).toBe(false);
  });
});

describe("reconcilePolledTimer (UX-34)", () => {
  const t0 = 1_000_000;
  const local = { status: "RUNNING" as const, remainingSeconds: 3600, syncedAtMs: t0 };

  it("흐른 시간만큼만 줄었으면 화면 값과 기준 시각을 유지해 카운트다운을 다시 시작하지 않는다", () => {
    const server = { id: "t1", title: "새 제목", status: "RUNNING" as const, remainingSeconds: 3594 };
    const { item, snapshot } = reconcilePolledTimer(local, server, t0 + 5_000);
    expect(item).toEqual({ ...server, remainingSeconds: 3600 });
    expect(snapshot).toBe(local);
  });

  it("다른 기기의 시간 추가는 서버 값으로 바꾸고 기준 시각을 새로 잡는다", () => {
    const server = { status: "RUNNING" as const, remainingSeconds: 3595 + 3600 };
    const { item, snapshot } = reconcilePolledTimer(local, server, t0 + 5_000);
    expect(item.remainingSeconds).toBe(7195);
    expect(snapshot).toEqual({ status: "RUNNING", remainingSeconds: 7195, syncedAtMs: t0 + 5_000 });
  });

  it("만료 등 상태 전이는 서버 값으로 바꾼다", () => {
    const server = { status: "EXPIRED" as const, remainingSeconds: 0 };
    expect(reconcilePolledTimer(local, server, t0 + 5_000).item).toBe(server);
  });

  it("처음 받는 값이면 서버 값을 쓴다", () => {
    const server = { status: "RUNNING" as const, remainingSeconds: 100 };
    const { item, snapshot } = reconcilePolledTimer(undefined, server, t0);
    expect(item).toBe(server);
    expect(snapshot).toEqual({ status: "RUNNING", remainingSeconds: 100, syncedAtMs: t0 });
  });
});
