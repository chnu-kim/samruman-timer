// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import { SessionExpiredHandler } from "../SessionExpiredHandler";
import { authFetch } from "@/lib/auth-fetch";

// session-expired.ts는 한 번만 발화하도록 모듈 수준 플래그를 둔다.
// 그래서 500 → 401 순서를 한 테스트 안에서 이어서 확인한다
describe("SessionExpiredHandler + authFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("500(refresh 중 D1 장애)은 세션 만료로 다루지 않고, 401만 세션 만료 토스트를 띄운다", async () => {
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
    const res500 = await authFetch("/api/auth/me");
    expect(res500.status).toBe(500);
    expect(expired).not.toHaveBeenCalled();
    expect(screen.queryByText("세션이 만료되었습니다. 다시 로그인해주세요.")).toBeNull();

    // 401: 만료 토스트를 띄운다
    let res401: Response | undefined;
    await act(async () => {
      res401 = await authFetch("/api/auth/me");
    });
    expect(res401?.status).toBe(401);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(screen.getByText("세션이 만료되었습니다. 다시 로그인해주세요.")).toBeInTheDocument();

    window.removeEventListener("session-expired", expired);
    vi.unstubAllGlobals();
  });
});
