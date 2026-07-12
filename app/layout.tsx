import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const previewImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "연수담 | 초등교사 연수관리",
      template: "%s | 연수담",
    },
    description:
      "대한민국 초등교사를 위한 연도별 법정의무연수와 개인 연수 기록장입니다.",
    applicationName: "연수담",
    keywords: [
      "초등교사",
      "법정의무연수",
      "교원연수",
      "연수관리",
      "교사 업무",
    ],
    openGraph: {
      title: "연수담 | 초등교사 연수관리",
      description: "올해의 의무연수와 나의 연수를 한눈에 챙겨보세요.",
      type: "website",
      locale: "ko_KR",
      siteName: "연수담",
      images: [
        {
          url: previewImage,
          width: 1734,
          height: 907,
          alt: "연수담 초등교사 연수관리",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "연수담 | 초등교사 연수관리",
      description: "올해의 의무연수와 나의 연수를 한눈에 챙겨보세요.",
      images: [previewImage],
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
