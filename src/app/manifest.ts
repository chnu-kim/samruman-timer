import type { MetadataRoute } from "next";

// /manifest.webmanifest로 서빙된다. 아이콘 PNG(public/icons)는 src/app/icon.svg에서 만든 것이므로 로고를 바꾸면 함께 다시 만든다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "삼루먼타이머",
    short_name: "삼루먼타이머",
    description: "스트리머를 위한 시간 추가형 타이머",
    lang: "ko",
    // "/"는 /projects로 307 리다이렉트하므로 바로 목록에서 시작한다
    start_url: "/projects",
    scope: "/",
    display: "standalone",
    // 라이트 테마 기본 배경(globals.css --background)과 맞춘다. 다크 대응은 layout.tsx의 viewport.themeColor가 맡는다
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
