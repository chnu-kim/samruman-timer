import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Next 16.3부터 빌드 타입 검사가 tsconfig의 모든 파일을 대상으로 해서, 테스트·스토리를 뺀 설정을 따로 쓴다
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // next dev가 CLAUDE.md에 자체 안내 블록을 덧붙이지 않게 한다. 하네스는 직접 관리한다
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      {
        // 오버레이 페이지만 정확히 제외하고 프레이밍을 막는다. `$`가 없으면 /timers/x/overlayfoo 같은 경로도 빠진다.
        // 끝 슬래시(/timers/x/overlay/)는 Next가 기본값 trailingSlash: false로 슬래시 없는 주소로 308 리다이렉트하고,
        // 브라우저는 최종 응답의 헤더로 프레이밍을 판정하므로 따로 제외하지 않는다(trailingSlash를 켜면 이 규칙도 고쳐야 한다).
        // script-src는 Next 인라인 스크립트·테마 초기화 스크립트 때문에 nonce 도입 전까지 두지 않는다.
        source: "/((?!timers/[^/]+/overlay$).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        // 배포 환경의 /sw.js는 Workers Static Assets가 Worker 없이 서빙하므로 public/_headers가 실제 헤더를 정한다.
        // 이 항목은 next start로 띄울 때만 적용된다.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        // OBS 브라우저 소스와 설정 화면 미리보기(iframe)로 쓰이므로 프레이밍은 허용한다.
        // 오버레이에는 이미지가 없으므로 외부 이미지 로드(방송 PC IP 노출 경로)를 막는다.
        source: "/timers/:id/overlay",
        headers: [
          { key: "Content-Security-Policy", value: "img-src 'self' data:; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
