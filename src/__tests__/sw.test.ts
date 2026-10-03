import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { isOverlayPath, SW_CACHE_PREFIX, SW_SCRIPT_PATH } from "@/lib/pwa";

const ORIGIN = "https://timer.example.com";
const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

type Listener = (event: unknown) => void;

// public/sw.js는 번들 밖 정적 스크립트라 import할 수 없다. 서비스워커 전역(self, caches)을 흉내 낸 컨텍스트에서 실행한다
function loadSw() {
  const listeners: Record<string, Listener> = {};
  // 실제 Cache API처럼 키를 절대 URL로 정규화하고, put은 기존 항목을 지운 뒤 맨 뒤에 다시 넣는다(keys() 순서 = 넣은 순서)
  const store = new Map<string, Response>();
  const key = (req: Request | string) => new URL(typeof req === "string" ? req : req.url, ORIGIN).href;
  const cache = {
    match: vi.fn(async (req: Request | string) => store.get(key(req))?.clone()),
    put: vi.fn(async (req: Request | string, res: Response) => {
      store.delete(key(req));
      store.set(key(req), res);
    }),
    keys: vi.fn(async () => [...store.keys()].map((url) => new Request(url))),
    delete: vi.fn(async (req: Request | string) => store.delete(key(req))),
  };
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = fn;
      },
      skipWaiting: vi.fn(async () => {}),
      clients: { claim: vi.fn(async () => {}) },
    },
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => [] as string[]),
      delete: vi.fn(async () => true),
    },
    fetch: fetchMock,
    URL,
    Request,
    Response,
    Headers,
    Promise,
    Error,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const sandbox = context as typeof context & {
    classifyRequest: (req: { method: string; url: string; mode?: string; referrer?: string }, origin: string) => string;
    isOverlayPath: (pathname: string) => boolean;
  };
  return { sandbox, listeners, cache, store, fetchMock };
}

const OFFLINE_KEY = `${ORIGIN}/offline.html`;

function req(path: string, init: { method?: string; mode?: string; referrer?: string } = {}) {
  const url = path.startsWith("http") ? path : ORIGIN + path;
  return { method: init.method ?? "GET", url, mode: init.mode ?? "cors", referrer: init.referrer ?? "" };
}

// 테스트 환경의 Response.type은 "default"라 같은 출처 응답처럼 "basic"으로 바꿔 준다
function basic(res: Response) {
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

function dispatchFetch(listeners: Record<string, Listener>, request: ReturnType<typeof req>) {
  const respondWith = vi.fn();
  const waited: Promise<unknown>[] = [];
  listeners.fetch({ request, respondWith, waitUntil: (p: Promise<unknown>) => waited.push(p) });
  return Object.assign(respondWith, { settled: () => Promise.all(waited) });
}

describe("sw.js 요청 분류", () => {
  const { sandbox } = loadSw();
  const classify = (r: ReturnType<typeof req>) => sandbox.classifyRequest(r, ORIGIN);

  it.each([
    ["API GET", req("/api/timers/abc")],
    ["API 내비게이션", req("/api/auth/login", { mode: "navigate" })],
    ["GET 아닌 요청", req("/projects", { method: "POST", mode: "navigate" })],
    ["오버레이 내비게이션", req("/timers/abc/overlay", { mode: "navigate" })],
    ["오버레이 끝 슬래시", req("/timers/abc/overlay/", { mode: "navigate" })],
    ["오버레이 쿼리", req("/timers/abc/overlay?fontSize=64&bg=transparent", { mode: "navigate" })],
    ["오버레이 iframe", req("/timers/abc/overlay", { mode: "no-cors" })],
    ["RSC 요청", req("/projects?_rsc=1a2b")],
    ["이미지 최적화", req("/_next/image?url=%2Fa.png&w=64&q=75")],
    ["다른 출처", req("https://chzzk.naver.com/account-interlock", { mode: "navigate" })],
    ["다른 출처 정적 경로", req("https://cdn.example.com/_next/static/chunks/a.js")],
    ["오버레이 문서가 보낸 정적 자산", req("/_next/static/chunks/a.js", { referrer: `${ORIGIN}/timers/abc/overlay?bg=transparent` })],
    ["오버레이 문서가 보낸 정적 자산(끝 슬래시)", req("/_next/static/chunks/a.js", { referrer: `${ORIGIN}/timers/abc/overlay/` })],
  ])("%s는 가로채지 않는다", (_name, r) => {
    expect(classify(r)).toBe("bypass");
  });

  it("해시 정적 자산은 캐시 대상", () => {
    expect(classify(req("/_next/static/chunks/main-abc123.js"))).toBe("static");
    expect(classify(req("/_next/static/media/font.woff2"))).toBe("static");
  });

  it("앱 페이지·빈 referrer·다른 출처의 오버레이 referrer에서 온 정적 자산은 캐시 대상", () => {
    const path = "/_next/static/chunks/a.js";
    expect(classify(req(path, { referrer: `${ORIGIN}/timers/abc` }))).toBe("static");
    expect(classify(req(path, { referrer: "" }))).toBe("static");
    expect(classify(req(path, { referrer: "about:client" }))).toBe("static");
    expect(classify(req(path, { referrer: "https://other.example.com/timers/abc/overlay" }))).toBe("static");
    // CSS가 부르는 폰트는 referrer가 CSS 파일이라 오버레이와 구분되지 않는다 (sw.js 머리 주석의 알려진 예외)
    expect(classify(req("/_next/static/media/font.woff2", { referrer: `${ORIGIN}/_next/static/css/a.css` }))).toBe("static");
  });

  it("앱 페이지 이동은 오프라인 폴백 대상", () => {
    expect(classify(req("/projects", { mode: "navigate" }))).toBe("navigate");
    expect(classify(req("/timers/abc", { mode: "navigate" }))).toBe("navigate");
    expect(classify(req("/timers/abc/stats", { mode: "navigate" }))).toBe("navigate");
  });

  it("캐시 접두사가 src/lib/pwa.ts와 같다 (개발 모드 정리가 이 접두사로 지운다)", () => {
    expect((sandbox as unknown as { CACHE_PREFIX: string }).CACHE_PREFIX).toBe(SW_CACHE_PREFIX);
    expect(SW_SCRIPT_PATH).toBe("/sw.js");
  });

  it("오버레이 판정이 src/lib/pwa.ts와 같다", () => {
    const paths = [
      "/timers/abc/overlay",
      "/timers/abc/overlay/",
      "/timers/abc/overlayfoo",
      "/timers/abc/overlay/x",
      "/timers//overlay",
      "/timers/abc",
      "/timers/abc/stats",
      "/overlay",
      "/projects/abc/overlay",
    ];
    for (const p of paths) expect(sandbox.isOverlayPath(p)).toBe(isOverlayPath(p));
  });
});

describe("sw.js fetch 핸들러", () => {
  it("bypass 요청에는 respondWith를 호출하지 않는다", () => {
    const { listeners } = loadSw();
    for (const r of [
      req("/api/timers/abc"),
      req("/timers/abc/overlay", { mode: "navigate" }),
      req("/projects?_rsc=1"),
      req("/projects", { method: "POST" }),
      req("/_next/static/chunks/a.js", { referrer: `${ORIGIN}/timers/abc/overlay` }),
    ]) {
      expect(dispatchFetch(listeners, r)).not.toHaveBeenCalled();
    }
  });

  it("정적 자산: 처음엔 네트워크에서 받아 저장한다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    const r = req("/_next/static/chunks/a.js");
    fetchMock.mockResolvedValueOnce(basic(new Response("js", { status: 200 })));

    const respondWith = dispatchFetch(listeners, r);
    const res = await respondWith.mock.calls[0][0];
    expect(await res.text()).toBe("js");
    await respondWith.settled();
    expect(await store.get(r.url)?.text()).toBe("js");
  });

  it("정적 자산: 상한을 넘으면 오래된 항목부터 지우고 오프라인 페이지는 남긴다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    store.set(OFFLINE_KEY, new Response("offline"));
    for (let i = 0; i < 200; i++) store.set(`${ORIGIN}/_next/static/chunks/old-${i}.js`, new Response(""));
    fetchMock.mockResolvedValueOnce(basic(new Response("new", { status: 200 })));

    const respondWith = dispatchFetch(listeners, req("/_next/static/chunks/new.js"));
    await respondWith.mock.calls[0][0];
    await respondWith.settled();
    expect(store.size).toBe(200);
    expect(store.has(OFFLINE_KEY)).toBe(true);
    expect(store.has(`${ORIGIN}/_next/static/chunks/old-0.js`)).toBe(false);
    expect(store.has(`${ORIGIN}/_next/static/chunks/new.js`)).toBe(true);
  });

  it("정적 자산: 캐시에 있으면 네트워크를 쓰지 않는다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    const r = req("/_next/static/chunks/a.js");
    store.set(r.url, new Response("cached"));

    const respondWith = dispatchFetch(listeners, r);
    const res = await respondWith.mock.calls[0][0];
    expect(await res.text()).toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("정적 자산: 캐시 적중 항목은 최근 사용으로 옮겨 상한 정리 때 남는다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    for (let i = 0; i < 200; i++) store.set(`${ORIGIN}/_next/static/chunks/c-${i}.js`, new Response(`c-${i}`));

    // 가장 먼저 들어간 공용 청크를 다시 쓴다
    const hit = dispatchFetch(listeners, req("/_next/static/chunks/c-0.js"));
    await hit.mock.calls[0][0];
    await hit.settled();
    expect([...store.keys()].at(-1)).toBe(`${ORIGIN}/_next/static/chunks/c-0.js`);

    fetchMock.mockResolvedValueOnce(basic(new Response("new", { status: 200 })));
    const miss = dispatchFetch(listeners, req("/_next/static/chunks/new.js"));
    await miss.mock.calls[0][0];
    await miss.settled();
    expect(store.size).toBe(200);
    expect(store.has(`${ORIGIN}/_next/static/chunks/c-0.js`)).toBe(true);
    expect(store.has(`${ORIGIN}/_next/static/chunks/c-1.js`)).toBe(false);
  });

  it("정적 자산: 동시에 여러 개 저장돼도 상한까지만 지운다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    for (let i = 0; i < 200; i++) store.set(`${ORIGIN}/_next/static/chunks/old-${i}.js`, new Response(""));
    fetchMock.mockImplementation(async () => basic(new Response("new", { status: 200 })));

    const pending = [0, 1, 2].map((i) => dispatchFetch(listeners, req(`/_next/static/chunks/new-${i}.js`)));
    await Promise.all(pending.map((r) => r.mock.calls[0][0]));
    await Promise.all(pending.map((r) => r.settled()));
    expect(store.size).toBe(200);
    for (let i = 0; i < 3; i++) expect(store.has(`${ORIGIN}/_next/static/chunks/new-${i}.js`)).toBe(true);
  });

  it("정적 자산: 오류 응답은 저장하지 않는다", async () => {
    const { listeners, fetchMock, cache } = loadSw();
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const respondWith = dispatchFetch(listeners, req("/_next/static/chunks/old.js"));
    const res = await respondWith.mock.calls[0][0];
    await respondWith.settled();
    expect(res.status).toBe(404);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("페이지 이동: 서버 오류 응답은 그대로 보여 준다", async () => {
    const { listeners, fetchMock, store } = loadSw();
    store.set(OFFLINE_KEY, new Response("offline"));
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    const respondWith = dispatchFetch(listeners, req("/projects", { mode: "navigate" }));
    const res = await respondWith.mock.calls[0][0];
    expect(res.status).toBe(500);
  });

  it("페이지 이동: 네트워크 오류면 오프라인 페이지를 보여 주고 HTML은 저장하지 않는다", async () => {
    const { listeners, fetchMock, store, cache } = loadSw();
    store.set(OFFLINE_KEY, new Response("offline"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const respondWith = dispatchFetch(listeners, req("/projects", { mode: "navigate" }));
    const res = await respondWith.mock.calls[0][0];
    expect(await res.text()).toBe("offline");
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe("sw.js 설치·활성화", () => {
  it("설치 때 오프라인 페이지를 리다이렉트 표시 없는 200 응답으로, 보안 헤더를 유지해 저장한다", async () => {
    const { listeners, fetchMock, store, sandbox } = loadSw();
    const redirected = new Response("<p>offline</p>", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Encoding": "br",
        "Content-Length": "999",
        "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
      },
    });
    Object.defineProperty(redirected, "redirected", { value: true });
    fetchMock.mockResolvedValueOnce(redirected);

    let done: Promise<unknown> = Promise.resolve();
    listeners.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;

    const saved = store.get(OFFLINE_KEY);
    expect(saved?.status).toBe(200);
    expect(saved?.redirected).toBe(false);
    expect(await saved?.text()).toBe("<p>offline</p>");
    expect(saved?.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(saved?.headers.get("X-Frame-Options")).toBe("DENY");
    expect(saved?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(saved?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(saved?.headers.has("Content-Encoding")).toBe(false);
    expect(saved?.headers.get("Content-Length")).not.toBe("999");
    expect(sandbox.self.skipWaiting).toHaveBeenCalled();
  });

  it("설치 때 오프라인 페이지를 받지 못하면 설치를 실패시키고 넘겨받지 않는다", async () => {
    const { listeners, fetchMock, store, sandbox } = loadSw();
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    let done: Promise<unknown> = Promise.resolve();
    listeners.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await expect(done).rejects.toThrow("404");

    expect(store.has(OFFLINE_KEY)).toBe(false);
    expect(sandbox.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("활성화 때 같은 접두사의 이전 버전 캐시만 지운다", async () => {
    const { listeners, sandbox } = loadSw();
    sandbox.caches.keys.mockResolvedValueOnce([
      "samrumantimer-static-v0",
      "samrumantimer-static-v1",
      "other-app-cache",
    ]);

    let done: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;

    expect(sandbox.caches.delete).toHaveBeenCalledTimes(1);
    expect(sandbox.caches.delete).toHaveBeenCalledWith("samrumantimer-static-v0");
    expect(sandbox.self.clients.claim).toHaveBeenCalled();
  });
});
