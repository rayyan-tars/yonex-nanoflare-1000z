import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SmoothScrollProvider } from "@/components/providers/SmoothScrollProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NANOFLARE 1000 Z — Cinematic Product Concept",
  description:
    "An independent cinematic concept site for the YONEX NANOFLARE 1000 Z — Lightning Yellow, NF-1000Z. Engineered for speed, built as a scroll-driven product story.",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "NANOFLARE 1000 Z — Cinematic Product Concept",
    description:
      "A scroll-driven cinematic concept experience for the YONEX NANOFLARE 1000 Z badminton racket in Lightning Yellow.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full bg-background text-foreground grain">
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
