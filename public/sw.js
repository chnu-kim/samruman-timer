// 삼루먼타이머 서비스워커.
//
// 캐시하는 것은 두 가지뿐이다.
// 1. /_next/static/* — 빌드 해시가 붙은 불변 자산(JS·CSS·폰트). 캐시 우선.
// 2. 오프라인 안내 페이지 — 설치 때 미리 받아 두고, 페이지 이동이 네트워크 오류로 실패할 때만 보여 준다.
//
// 다음은 절대 가로채지 않는다(respondWith를 호출하지 않아 브라우저가 그대로 처리한다).
// - /api/*: 잔여시간은 서버가 매 요청 계산하고, 미들웨어가 session/refresh 쿠키를 회전시킨다.
// - 오버레이(/timers/<id>/overlay): OBS 브라우저 소스라 오래된 화면이나 오프라인 안내가 방송에 나가면 안 된다.
//   오버레이 문서 요청뿐 아니라 오버레이 문서가 보낸 하위 요청(referrer가 오버레이인 /_next/static/* 청크)도 넘긴다.
//   SW가 이미 등록된 브라우저에서 오버레이를 열거나 설정 화면에서 iframe으로 미리 볼 때 해당한다.
//   예외: CSS의 @font-face가 부르는 폰트는 referrer가 CSS 파일이라 구분되지 않아 캐시를 탈 수 있다(해시 붙은 불변 파일).
// - GET이 아닌 요청, 다른 출처 요청(CHZZK OAuth 등), RSC 요청(?_rsc), /_next/image.
// 페이지 HTML은 저장하지 않는다. 사용자별 응답과 빌드별 청크 해시가 섞여 있어 재생하면 깨진다.
//
// navigation preload는 일부러 켜지 않는다. 켜면 respondWith를 부르지 않는 내비게이션(/api/auth/callback, 오버레이)에도
// 미리 받기 요청이 나가고, 브라우저는 쓰지 않은 미리 받기 응답을 버린 뒤 같은 요청을 다시 보낸다.
// 그러면 CHZZK OAuth 인가 코드가 두 번 교환되어 로그인이 깨질 수 있다. 이를 피하려면 /api 내비게이션까지 가로채야 해서
// '/api는 가로채지 않는다' 원칙과 충돌한다. 페이지 이동마다 SW 기동 시간만큼 늦어지는 비용은 감수한다.
//
// 이 파일은 번들 밖 정적 파일이라 src/lib/pwa.ts를 import하지 못한다. 오버레이 판정을 바꾸면 그쪽도 함께 바꾼다
// (src/__tests__/sw.test.ts가 둘이 같은지 확인한다).

// 오프라인 페이지 문구나 캐시 정책을 바꾸면 올린다. activate에서 이전 버전 캐시를 지운다.
var CACHE_VERSION = "v1";
var CACHE_PREFIX = "samrumantimer-";
var STATIC_CACHE = CACHE_PREFIX + "static-" + CACHE_VERSION;
var OFFLINE_URL = "/offline.html";
// 배포마다 해시가 바뀐 청크가 쌓이므로 상한을 둔다. 넘으면 가장 오래 쓰지 않은 것부터 지운다.
// (캐시 적중 때 항목을 다시 넣어 순서를 뒤로 보내므로 Cache.keys() 순서가 최근 사용 순서가 된다.
//  청크 URL에 빌드 ID가 없어 빌드 단위로는 정리할 수 없다.)
var MAX_STATIC_ENTRIES = 200;

var OVERLAY_PATH_PATTERN = /^\/timers\/[^/]+\/overlay\/?$/;

function isOverlayPath(pathname) {
  return OVERLAY_PATH_PATTERN.test(pathname);
}

/**
 * 오버레이 문서가 보낸 하위 요청인지. respondWith는 동기로 불러야 해서 clients.get() 대신 referrer로 판정한다.
 * 같은 출처 요청에는 Referrer-Policy(strict-origin-when-cross-origin)상 문서 전체 URL이 실린다.
 */
function isFromOverlay(request, origin) {
  if (!request.referrer) return false;
  try {
    var ref = new URL(request.referrer);
    return ref.origin === origin && isOverlayPath(ref.pathname);
  } catch (err) {
    return false;
  }
}

/**
 * 요청을 어떻게 다룰지 정한다.
 * @returns {"static" | "navigate" | "bypass"}
 */
function classifyRequest(request, origin) {
  if (request.method !== "GET") return "bypass";
  var url = new URL(request.url);
  if (url.origin !== origin) return "bypass";
  if (url.pathname === "/api" || url.pathname.indexOf("/api/") === 0) return "bypass";
  if (isOverlayPath(url.pathname)) return "bypass";
  if (isFromOverlay(request, origin)) return "bypass";
  if (url.pathname.indexOf("/_next/static/") === 0) return "static";
  if (request.mode === "navigate") return "navigate";
  return "bypass";
}

async function precacheOffline() {
  var cache = await caches.open(STATIC_CACHE);
  var res = await fetch(OFFLINE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("offline page fetch failed: " + res.status);
  // 정적 자산 계층이 /offline.html → /offline으로 리다이렉트하면 응답에 redirected가 붙고,
  // 그런 응답을 페이지 이동에 돌려주면 브라우저가 거부한다. 본문만 담아 새 응답으로 저장한다.
  // 헤더는 원본을 옮긴다. SW 응답의 헤더가 문서 정책이 되므로, 빼면 public/_headers의 CSP·X-Frame-Options가 사라진다.
  // 본문은 이미 풀린 상태라 인코딩·길이 헤더는 뺀다.
  var body = await res.blob();
  var headers = new Headers(res.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/html; charset=utf-8");
  await cache.put(OFFLINE_URL, new Response(body, { status: 200, headers: headers }));
}

async function trimCacheNow() {
  var cache = await caches.open(STATIC_CACHE);
  var keys = await cache.keys();
  var excess = keys.length - MAX_STATIC_ENTRIES;
  for (var i = 0; i < keys.length && excess > 0; i++) {
    if (new URL(keys[i].url).pathname === OFFLINE_URL) continue;
    await cache.delete(keys[i]);
    excess--;
  }
}

// 동시에 여러 요청이 저장되어도 정리는 한 번에 하나만 돈다. 도는 중에 또 요청되면 끝난 뒤 한 번 더 돈다.
var trimRunning = null;
var trimPending = false;

function trimCache() {
  if (trimRunning) {
    trimPending = true;
    return trimRunning;
  }
  trimRunning = trimCacheNow()
    .catch(function () {})
    .then(function () {
      trimRunning = null;
      if (trimPending) {
        trimPending = false;
        return trimCache();
      }
    });
  return trimRunning;
}

async function handleStatic(event) {
  var request = event.request;
  var cache = await caches.open(STATIC_CACHE);
  var cached = await cache.match(request);
  if (cached) {
    // 다시 넣어 순서를 뒤로 보낸다(최근 사용). 응답을 늦추지 않도록 기다리지 않는다
    event.waitUntil(cache.put(request, cached.clone()).catch(function () {}));
    return cached;
  }
  var res = await fetch(request);
  // 404(배포로 사라진 구 청크)나 오류 응답은 저장하지 않는다.
  // 저장·정리는 응답을 늦추지 않도록 기다리지 않는다(배포 직후 청크가 한꺼번에 빠질 때 특히).
  if (res.ok && res.type === "basic") {
    event.waitUntil(cache.put(request, res.clone()).then(trimCache).catch(function () {}));
  }
  return res;
}

async function handleNavigate(request) {
  try {
    // 네트워크 전용. 4xx/5xx도 서버 응답이므로 그대로 보여 준다
    return await fetch(request);
  } catch (err) {
    var cache = await caches.open(STATIC_CACHE);
    var offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw err;
  }
}

self.addEventListener("install", function (event) {
  // HTML을 캐시하지 않으므로 새 버전이 바로 넘겨받아도 열린 탭과 어긋날 것이 없다
  event.waitUntil(precacheOffline().then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              return name.indexOf(CACHE_PREFIX) === 0 && name !== STATIC_CACHE;
            })
            .map(function (name) {
              return caches.delete(name);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var kind = classifyRequest(event.request, self.location.origin);
  if (kind === "static") {
    event.respondWith(handleStatic(event));
  } else if (kind === "navigate") {
    event.respondWith(handleNavigate(event.request));
  }
  // bypass: respondWith를 부르지 않아 브라우저가 네트워크로 직접 처리한다
});
