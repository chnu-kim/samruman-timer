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
        // 오버레이 경로 제외 — OBS 브라우저 소스(iframe)로 사용
        source: "/((?!timers/[^/]+/overlay).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/timers/:id/overlay",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
