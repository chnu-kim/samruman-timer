// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMe, resetMeCache } from "../session-me";
import { fireSessionExpired } from "../session-expired";

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
