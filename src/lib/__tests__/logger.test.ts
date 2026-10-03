import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import { logger, errorFields } from "@/lib/logger";

function lastJson(spy: MockInstance<(...args: unknown[]) => void>) {
  const calls = spy.mock.calls;
  const call = calls[calls.length - 1];
  expect(call).toHaveLength(1);
  return JSON.parse(String(call[0]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("level별로 console.log·warn·error에 JSON 한 줄을 남긴다", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.info("a.info", { n: 1 });
    logger.warn("a.warn");
    logger.error("a.error", { requestId: "r-1" });

    expect(lastJson(log)).toMatchObject({ level: "info", event: "a.info", message: "a.info", n: 1 });
    expect(lastJson(warn)).toMatchObject({ level: "warn", event: "a.warn", message: "a.warn" });
    expect(lastJson(error)).toMatchObject({ level: "error", event: "a.error", requestId: "r-1" });
  });

  it("timestamp는 ISO 8601 UTC 문자열이다", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("t");
    const { timestamp } = lastJson(log);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("fields가 예약 키(level·event·message·timestamp)를 덮어쓰지 못한다", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("real.event", {
      level: "info",
      event: "fake",
      message: "fake",
      timestamp: "1970-01-01T00:00:00.000Z",
    });
    const entry = lastJson(error);
    expect(entry.level).toBe("error");
    expect(entry.event).toBe("real.event");
    expect(entry.message).toBe("real.event");
    expect(entry.timestamp).not.toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("errorFields", () => {
  it("D1의 no such table·column 오류는 schema_drift로 분류한다", () => {
    expect(errorFields(new Error("D1_ERROR: no such table: refresh_tokens: SQLITE_ERROR")).kind).toBe(
      "schema_drift"
    );
    expect(errorFields(new Error("no such column: family_expires_at")).kind).toBe("schema_drift");
  });

  it("AbortSignal.timeout의 TimeoutError는 timeout으로 분류한다", () => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const fields = errorFields(err);
    expect(fields.kind).toBe("timeout");
    expect(fields.errorName).toBe("TimeoutError");
  });

  it("그 밖의 오류는 unknown이다", () => {
    const fields = errorFields(new TypeError("boom"));
    expect(fields).toMatchObject({ errorName: "TypeError", error: "boom", kind: "unknown" });
  });

  it("message·cause는 300자, stack은 2000자로 자른다", () => {
    const err = new Error("m".repeat(1000), { cause: "c".repeat(1000) });
    err.stack = `Error: ${"m".repeat(1000)}` + "\n    at frame (file.js:1:1)".repeat(200);
    const fields = errorFields(err);
    expect(String(fields.error)).toHaveLength(300);
    expect(String(fields.cause)).toHaveLength(300);
    expect(String(fields.stack)).toHaveLength(2000);
  });

  it("stack 머리말의 메시지도 300자 상한을 지킨다(서브클래스 name이 머리말과 달라도)", () => {
    class WrappedError extends Error {
      constructor(message: string) {
        super(message);
        // ChzzkApiError처럼 super() 뒤에 name을 바꾸면 V8 stack 머리말은 "Error: ..."로 남는다
        this.name = "WrappedError";
      }
    }
    const secret = "x".repeat(300) + "BODY-TAIL-THAT-MUST-NOT-LEAK";
    const fields = errorFields(new WrappedError(secret));
    const stack = String(fields.stack);
    expect(stack).not.toContain("BODY-TAIL-THAT-MUST-NOT-LEAK");
    expect(stack.startsWith(`WrappedError: ${"x".repeat(300)}\n`)).toBe(true);
    // 프레임은 남긴다
    expect(stack).toMatch(/\n\s+at /);
  });

  it("frame이 없는 stack은 머리말만 잘린 메시지로 남긴다", () => {
    const err = new Error("m".repeat(1000));
    err.stack = `Error: ${"m".repeat(1000)}`;
    expect(String(errorFields(err).stack)).toBe(`Error: ${"m".repeat(300)}`);
  });

  it("감싼 오류의 cause가 TimeoutError이거나 timedOut이면 timeout으로 분류한다", async () => {
    const { ChzzkApiError } = await import("@/lib/chzzk");
    const timeoutErr = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const wrapped = new ChzzkApiError("token", "CHZZK token exchange timed out", {
      timedOut: true,
      cause: timeoutErr,
    });
    expect(errorFields(wrapped)).toMatchObject({ errorName: "ChzzkApiError", kind: "timeout" });
    expect(errorFields(new Error("wrapped", { cause: timeoutErr })).kind).toBe("timeout");
    expect(errorFields(Object.assign(new Error("flag"), { timedOut: true })).kind).toBe("timeout");
    expect(errorFields(new ChzzkApiError("user", "CHZZK user info failed: 500", { status: 500 })).kind).toBe(
      "unknown"
    );
  });

  it("cause가 없으면 cause 키를 넣지 않는다", () => {
    expect(errorFields(new Error("x"))).not.toHaveProperty("cause");
  });

  it("Error가 아닌 값도 문자열로 남긴다", () => {
    expect(errorFields("plain")).toMatchObject({ errorName: "string", error: "plain", kind: "unknown" });
    expect(errorFields(undefined)).toMatchObject({ error: "undefined", kind: "unknown" });
  });
});
