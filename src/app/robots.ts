import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 오버레이·콜백은 Disallow하지 않는다. 막으면 크롤러가 페이지의 noindex 메타를 읽지 못해
// 외부 링크만으로 주소가 색인될 수 있다. 색인 제외는 각 layout.tsx의 robots 메타가 맡는다
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
