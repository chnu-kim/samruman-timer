// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMe, resetMeCache } from "../session-me";
import { fireSessionExpired } from "../session-expired";
import { AUTH_HINT_INIT_SCRIPT } from "../auth-hint";

const me = { id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null };

function respond(status: number) {
  return vi.fn(async () =>
    status === 200
      ? new Response(JSON.stringify({ data: me }), { status })
      : new Response(JSON.stringify({ error: { code: "X", message: "" } }), { status }),
  );
}

afterEach(() => {
  resetMeCache();
  vi.unstubAllGlobals();
});

// R24: 헤더와 로그인 화면이 같은 첫 로드에 세션을 확인해도 요청은 한 번이다
describe("fetchMe", () => {
  it("동시에 불러도, 끝난 뒤 다시 불러도 한 번만 묻는다(401·200은 확정)", async () => {
    const fetchMock = respond(401);
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([fetchMe(), fetchMe()]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(await fetchMe()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");

    resetMeCache();
    vi.stubGlobal("fetch", respond(200));
    expect(await fetchMe()).toEqual(me);
  });

  it("500·네트워크 오류는 null이고 다음 호출이 다시 묻는다", async () => {
    const failing = respond(500);
    vi.stubGlobal("fetch", failing);
    expect(await fetchMe()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await fetchMe()).toBeNull();
    const ok = respond(200);
    vi.stubGlobal("fetch", ok);
    expect(await fetchMe()).toEqual(me);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  // 다른 탭에서 로그인한 뒤 뒤로 가기로 /login에 돌아오면 같은 문서라도 다시 물어야 한다
  it("확정 결과는 잠깐(3초)만 다시 쓰고 그 뒤에는 새로 묻는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const first = respond(401);
      vi.stubGlobal("fetch", first);
      expect(await fetchMe()).toBeNull();
      vi.setSystemTime(Date.now() + 2000);
      expect(await fetchMe()).toBeNull();
      expect(first).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 1500);
      const later = respond(200);
      vi.stubGlobal("fetch", later);
      expect(await fetchMe()).toEqual(me);
      expect(later).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("세션 만료 이벤트가 나면 캐시를 비운다", async () => {
    vi.stubGlobal("fetch", respond(200));
    expect(await fetchMe()).toEqual(me);
    const after = respond(401);
    vi.stubGlobal("fetch", after);
    fireSessionExpired();
    expect(await fetchMe()).toBeNull();
    expect(after).toHaveBeenCalledTimes(1);
  });
});

// W29: 다음 로드의 첫 골격(로그인 확인 전)이 로그아웃 방문자에게 시청자 모양을 보이도록 확정 결과를 힌트로 남긴다
describe("로그인 힌트 (auth-hint)", () => {
  afterEach(() => localStorage.clear());

  it("200이면 로그인, 401이면 로그아웃으로 남기고 500은 그대로 둔다", async () => {
    vi.stubGlobal("fetch", respond(200));
    await fetchMe();
    expect(localStorage.getItem("signedIn")).toBe("1");

    resetMeCache();
    vi.stubGlobal("fetch", respond(500));
    await fetchMe();
    expect(localStorage.getItem("signedIn")).toBe("1");

    resetMeCache();
    vi.stubGlobal("fetch", respond(401));
    await fetchMe();
    expect(localStorage.getItem("signedIn")).toBeNull();
  });

  it("첫 페인트 전 스크립트는 힌트가 없으면(첫 방문) out, 로그인으로 남았으면 in을 html에 붙인다", () => {
    const run = () => new Function(AUTH_HINT_INIT_SCRIPT)();
    run();
    expect(document.documentElement.getAttribute("data-auth")).toBe("out");
    localStorage.setItem("signedIn", "1");
    run();
    expect(document.documentElement.getAttribute("data-auth")).toBe("in");
  });
});
