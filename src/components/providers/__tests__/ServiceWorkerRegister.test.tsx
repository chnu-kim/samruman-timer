// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { ServiceWorkerRegister } from "../ServiceWorkerRegister";

describe("ServiceWorkerRegister", () => {
  const register = vi.fn(() => Promise.resolve({}));

  beforeEach(() => {
    register.mockClear();
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("앱 페이지에서는 루트 scope로 /sw.js를 등록한다", () => {
    window.history.pushState({}, "", "/projects");
    render(<ServiceWorkerRegister />);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("오버레이(OBS 브라우저 소스)에서는 등록하지 않는다", () => {
    window.history.pushState({}, "", "/timers/abc/overlay?fontSize=64");
    render(<ServiceWorkerRegister />);
    expect(register).not.toHaveBeenCalled();
  });

  it("등록이 실패해도 예외를 밖으로 던지지 않는다", async () => {
    register.mockReturnValueOnce(Promise.reject(new Error("blocked")));
    window.history.pushState({}, "", "/projects");
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    await Promise.resolve();
  });

  it("서비스워커를 지원하지 않는 브라우저에서는 아무것도 하지 않는다", () => {
    // @ts-expect-error 테스트용으로 지원하지 않는 환경을 만든다
    delete navigator.serviceWorker;
    window.history.pushState({}, "", "/projects");
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });
});
