import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "채권세상",
  description: "채권정보만 입력하면 현금흐름을 보여주는 서비스",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
