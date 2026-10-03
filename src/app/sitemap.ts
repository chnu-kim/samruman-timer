import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 로그인 없이 내용이 보이는 고정 경로만 둔다. "/"는 /projects로 리다이렉트하므로 넣지 않는다
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/projects`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
