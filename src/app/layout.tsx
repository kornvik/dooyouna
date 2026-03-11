import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DooYouNa - แดชบอร์ดข่าวกรอง ไทย & กัมพูชา",
  description: "ระบบเฝ้าระวังข่าวกรองโอเพ่นซอร์ส ประเทศไทยและกัมพูชา",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
