import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DooYouNa - Thailand & Cambodia OSINT",
  description: "Open-source intelligence dashboard for Thailand and Cambodia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
