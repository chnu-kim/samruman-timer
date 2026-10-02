import { hasExternalChange } from "../timer-sync";

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
