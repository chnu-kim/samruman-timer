// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { ServiceWorkerCleanup } from "../ServiceWorkerCleanup";

function registration(scriptURL: string) {
  return { active: { scriptURL }, waiting: null, installing: null, unregister: vi.fn(async () => true) };
}

describe("ServiceWorkerCleanup", () => {
  const originalCaches = (globalThis as { caches?: unknown }).caches;

  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = originalCaches;
  });

  it("이 앱의 /sw.js 등록과 samrumantimer- 캐시만 지운다", async () => {
    const ours = registration("http://localhost:3000/sw.js");
    const other = registration("http://localhost:3000/other-sw.js");
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistrations: vi.fn(async () => [ours, other]) },
      configurable: true,
    });
    const del = vi.fn(async () => true);
    (globalThis as { caches?: unknown }).caches = {
      keys: vi.fn(async () => ["samrumantimer-static-v1", "other-app-cache"]),
      delete: del,
    };

    render(<ServiceWorkerCleanup />);

    await waitFor(() => expect(ours.unregister).toHaveBeenCalled());
    await waitFor(() => expect(del).toHaveBeenCalledWith("samrumantimer-static-v1"));
    expect(other.unregister).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("서비스워커·Cache API가 없는 브라우저에서도 예외를 던지지 않는다", () => {
    // @ts-expect-error 테스트용으로 지원하지 않는 환경을 만든다
    delete navigator.serviceWorker;
    delete (globalThis as { caches?: unknown }).caches;
    expect(() => render(<ServiceWorkerCleanup />)).not.toThrow();
  });
});
