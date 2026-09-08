import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Loop 50: the reference apps (AOS/Quality) both name "Inter" as their
// font-family but never actually load it anywhere (no <link>, no
// @font-face) — it silently falls back to the OS system font on every
// device that doesn't happen to have Inter installed. Loading it for
// real here is a small, deliberate improvement over both references,
// not a deviation from them.
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MONARCH Maintenance",
  description: "MONARCH — Maintenance Module",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0f18",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
