import type { Metadata, Viewport } from "next";
import { Caveat, Geist_Mono, Inter, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/install-app";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-caveat",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RvessFlow",
  description: "Beta. Your money, in motion on Base.",
  applicationName: "RvessFlow",
  appleWebApp: { capable: true, title: "RvessFlow", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${caveat.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
