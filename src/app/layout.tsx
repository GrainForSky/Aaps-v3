import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "AndroidAPS 远程控制",
  description: "远程管理胰岛素和碳水输注",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
