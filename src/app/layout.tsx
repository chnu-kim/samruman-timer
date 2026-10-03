import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionExpiredHandler } from "@/components/providers/SessionExpiredHandler";
import { ServiceWorkerRegister } from "@/components/providers/ServiceWorkerRegister";
import { ServiceWorkerCleanup } from "@/components/providers/ServiceWorkerCleanup";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, TITLE_TEMPLATE } from "@/lib/site";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: TITLE_TEMPLATE },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["치지직", "CHZZK", "서브어톤", "타이머", "OBS 오버레이", "방송 타이머", "스트리머"],
  // 이미지는 같은 폴더의 opengraph-image.png를 Next가 openGraph·twitter 양쪽에 자동으로 넣는다
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  // iOS 홈 화면 앱 이름·상태 표시줄. iOS 16.4 이전 Safari는 매니페스트 display를 읽지 않으므로
  // apple-mobile-web-app-capable도 함께 출력한다(Next는 capable을 mobile-web-app-capable로만 내보낸다)
  appleWebApp: { capable: true, title: "삼루먼타이머", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

// 설치 앱의 상태 표시줄 색. manifest의 theme_color는 하나뿐이라 시스템 다크 모드는 여기서 보완한다
// (앱 안에서 테마를 직접 고른 경우까지는 따라가지 않는다)
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${notoSansKR.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider>
          <ToastProvider>
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
            <Footer />
            <SessionExpiredHandler />
            {/* 클라이언트 파일에서 process.env를 읽지 않도록 프로덕션 판정은 여기서 한다.
                개발 모드에서는 next start 때 남은 SW가 dev 청크를 캐시로 내주지 않게 지운다 */}
            {process.env.NODE_ENV === "production" ? <ServiceWorkerRegister /> : <ServiceWorkerCleanup />}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
