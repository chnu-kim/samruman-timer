import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from "vitest";

const getCloudflareContext = vi.fn();
/**
 * thenable 경로 검사용. vi.fn은 돌려준 promise에 then을 달아 결과를 추적하므로(settledResults)
 * 거부가 항상 처리된 것으로 보인다. 그 경로만 vi.fn을 거치지 않는 값을 돌려준다
 */
let rawReturn: (() => unknown) | undefined;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => (rawReturn ? rawReturn() : getCloudflareContext()),
}));

let error: MockInstance<typeof console.error>;

/** logger는 버전을 모듈에 캐시하므로 테스트마다 모듈을 새로 불러온다 */
async function freshLogger() {
  vi.resetModules();
  return (await import("@/lib/logger")).logger;
}

function lastEntry() {
  const calls = error.mock.calls;
  return JSON.parse(String(calls[calls.length - 1][0]));
}

beforeEach(() => {
  getCloudflareContext.mockReset();
  rawReturn = undefined;
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger 버전 필드", () => {
  it("CF_VERSION_METADATA의 id·tag를 versionId·versionTag로 붙인다", async () => {
    getCloudflareContext.mockReturnValue({
      env: { CF_VERSION_METADATA: { id: "ver-1", tag: "abc123def456", timestamp: "t" } },
    });
    const logger = await freshLogger();
    logger.error("x");
    expect(lastEntry()).toMatchObject({ versionId: "ver-1", versionTag: "abc123def456", event: "x" });
  });

  it("성공한 값은 캐시해 컨텍스트를 다시 읽지 않는다", async () => {
    getCloudflareContext.mockReturnValue({ env: { CF_VERSION_METADATA: { id: "ver-1", tag: "t1" } } });
    const logger = await freshLogger();
    logger.error("a");
    logger.error("b");
    expect(getCloudflareContext).toHaveBeenCalledTimes(1);
    expect(lastEntry().versionTag).toBe("t1");
  });

  it("컨텍스트 조회가 던지면 버전 필드를 생략하고 로그는 남긴다. 실패는 캐시하지 않는다", async () => {
    getCloudflareContext.mockImplementation(() => {
      throw new Error("not in request context");
    });
    const logger = await freshLogger();
    logger.error("x", { n: 1 });
    const entry = lastEntry();
    expect(entry).toMatchObject({ event: "x", n: 1 });
    expect(entry).not.toHaveProperty("versionId");
    expect(entry).not.toHaveProperty("versionTag");

    getCloudflareContext.mockReturnValue({ env: { CF_VERSION_METADATA: { id: "ver-2", tag: "t2" } } });
    logger.error("y");
    expect(lastEntry()).toMatchObject({ versionId: "ver-2", versionTag: "t2" });
  });

  it("thenable이 돌아오면 쓰지 않고, 거부돼도 unhandled rejection을 만들지 않는다", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      rawReturn = () => Promise.reject(new Error("async only"));
      const logger = await freshLogger();
      logger.error("x");
      expect(lastEntry()).not.toHaveProperty("versionId");
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("바인딩이 없거나 tag가 비어 있으면 해당 필드를 생략한다", async () => {
    getCloudflareContext.mockReturnValue({ env: {} });
    let logger = await freshLogger();
    logger.error("x");
    expect(lastEntry()).not.toHaveProperty("versionId");

    getCloudflareContext.mockReturnValue({ env: { CF_VERSION_METADATA: { id: "ver-3", tag: "" } } });
    logger = await freshLogger();
    logger.error("y");
    const entry = lastEntry();
    expect(entry.versionId).toBe("ver-3");
    expect(entry).not.toHaveProperty("versionTag");
  });

  it("fields가 versionId·versionTag를 덮어쓰거나 버전을 모를 때 끼워 넣지 못한다", async () => {
    getCloudflareContext.mockReturnValue({ env: { CF_VERSION_METADATA: { id: "ver-1", tag: "real" } } });
    let logger = await freshLogger();
    logger.error("x", { versionId: "fake", versionTag: "fake" });
    expect(lastEntry()).toMatchObject({ versionId: "ver-1", versionTag: "real" });

    getCloudflareContext.mockImplementation(() => {
      throw new Error("no ctx");
    });
    logger = await freshLogger();
    logger.error("y", { versionId: "fake", versionTag: "fake" });
    const entry = lastEntry();
    expect(entry).not.toHaveProperty("versionId");
    expect(entry).not.toHaveProperty("versionTag");
  });
});
