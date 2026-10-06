import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 첫 화면(/projects)만 둔다. "/"는 /projects로 리다이렉트하므로 넣지 않는다.
// /login은 로그아웃 /projects와 같은 진입 화면(SignInScreen)이라 같은 본문을 두 번 알리지 않는다(색인·canonical은 그대로)
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/projects`, changeFrequency: "daily", priority: 1 }];
}
