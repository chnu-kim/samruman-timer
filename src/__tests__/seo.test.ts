import { vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as rootMetadata } from "@/app/layout";
import { metadata as overlayMetadata } from "@/app/timers/[id]/overlay/layout";
import { metadata as callbackMetadata } from "@/app/(auth)/callback/layout";
import { metadata as statsMetadata } from "@/app/timers/[id]/stats/layout";
import { metadata as projectsMetadata } from "@/app/projects/layout";
import { generateMetadata as projectDetailMetadata } from "@/app/projects/[id]/layout";
import { metadata as timerMetadata } from "@/app/timers/[id]/layout";
import { SITE_URL, TITLE_TEMPLATE } from "@/lib/site";

// 루트 layout의 next/font는 Next 빌드 밖에서 동작하지 않는다
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ variable: "" }),
  Geist_Mono: () => ({ variable: "" }),
}));

describe("SEO", () => {
  it("사이트 주소는 빌드 환경과 무관한 프로덕션 https 주소다", () => {
    // BASE_URL(.env의 localhost)을 쓰면 프리렌더된 메타에 localhost가 박힌다
    expect(SITE_URL).toMatch(/^https:\/\//);
    expect(SITE_URL).not.toMatch(/localhost|\/$/);
    expect(rootMetadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });

  it("robots.txt는 API만 막고 sitemap 절대 주소를 알린다", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: "/api/" });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("sitemap은 로그인 없이 보이는 고정 경로만 담는다", () => {
    expect(sitemap().map((e) => e.url)).toEqual([`${SITE_URL}/projects`, `${SITE_URL}/login`]);
  });

  it("오버레이·콜백·통계 화면은 noindex다", () => {
    for (const m of [overlayMetadata, callbackMetadata, statsMetadata]) {
      expect(m.robots).toEqual({ index: false, follow: false });
    }
  });

  it("하위 페이지가 있는 layout은 title 템플릿을 다시 선언한다", () => {
    // 문자열 title이면 하위 세그먼트(상세·오버레이·통계)에서 "| 삼루먼타이머"가 빠진다
    for (const m of [projectsMetadata, timerMetadata]) {
      expect(m.title).toMatchObject({ template: TITLE_TEMPLATE });
    }
  });

  it("프로젝트 상세는 목록 canonical을 물려받지 않고 자기 주소를 쓴다", async () => {
    const m = await projectDetailMetadata({ params: Promise.resolve({ id: "abc" }) });
    expect(m.alternates?.canonical).toBe("/projects/abc");
  });
});
