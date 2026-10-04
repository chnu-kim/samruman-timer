// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import { SessionExpiredHandler, SESSION_EXPIRED_TOAST } from "../SessionExpiredHandler";
import { authFetch } from "@/lib/auth-fetch";

// authFetch를 쓰는 화면(시간 증감 등)의 계약만 확인한다. 페이지 로드 때 refresh를 처음 일으키는
// GET /api/auth/me는 Header·각 페이지가 authFetch가 아닌 fetch로 부르므로 이 경로를 타지 않는다
// (그쪽 500 동작은 Header.test.tsx).
// session-expired.ts는 한 번만 발화하도록 모듈 수준 플래그를 둔다.
// 그래서 500 → 401 순서를 한 테스트 안에서 이어서 확인한다
describe("SessionExpiredHandler + authFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("authFetch는 500을 세션 만료로 다루지 않고 호출자에게 돌려주며, 401만 세션 만료 토스트를 띄운다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } }), {
          status: 500,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "유효하지 않은 세션입니다" } }), {
          status: 401,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const expired = vi.fn();
    window.addEventListener("session-expired", expired);

    render(
      <ToastProvider>
        <SessionExpiredHandler />
      </ToastProvider>
    );

    // 500: 응답을 그대로 호출자에게 돌려주고 만료 이벤트·토스트·이동이 없다
    const res500 = await authFetch("/api/timers/t-1/modify", { method: "POST" });
    expect(res500.status).toBe(500);
    expect(expired).not.toHaveBeenCalled();
    expect(screen.queryByText(SESSION_EXPIRED_TOAST)).toBeNull();

    // 401: 만료 토스트를 띄운다
    let res401: Response | undefined;
    await act(async () => {
      res401 = await authFetch("/api/timers/t-1/modify", { method: "POST" });
    });
    expect(res401?.status).toBe(401);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(screen.getByText(SESSION_EXPIRED_TOAST)).toBeInTheDocument();

    // 1.5초 뒤 만료 표시를 실어 로그인 화면으로 보낸다(로그인 화면이 이유를 한 줄 알린다)
    const hrefSet = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { set href(v: string) { hrefSet(v); } },
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    Object.defineProperty(window, "location", { configurable: true, value: original });
    expect(hrefSet).toHaveBeenCalledTimes(1);
    expect(hrefSet.mock.calls[0][0]).toMatch(/^\/login\?(next=[^&]+&)?expired=1$/);

    window.removeEventListener("session-expired", expired);
    vi.unstubAllGlobals();
  });
});
