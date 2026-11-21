import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// 中文衬线：按 unicode-range 分片自托管，浏览器只下载用到的字
const notoSerif = Noto_Serif_SC({ variable: "--font-noto-serif", weight: ["500", "600"], preload: false, display: "swap" });

export const metadata: Metadata = {
  title: "无痕 Unmarked — 短视频去水印解析",
  description: "粘贴分享链接，获取无水印的视频、原图与实况。支持抖音、快手、小红书、哔哩哔哩、微博等平台，免登录、不存储。",
  keywords: ["短视频解析", "去水印", "抖音", "快手", "小红书", "哔哩哔哩", "微博"],
  // 让媒体请求不带 Referer，避免部分 CDN 防盗链
  referrer: "no-referrer",
  icons: { icon: "/icon.png" },
  openGraph: {
    title: "无痕 Unmarked",
    description: "去掉水印，留下作品。",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${notoSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
