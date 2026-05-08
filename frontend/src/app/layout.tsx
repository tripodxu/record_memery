import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula Memory",
  description: "记忆碎片 — 你的个人记忆星云",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ background: "#030305", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
