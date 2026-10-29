import type { Metadata, Viewport } from "next";
import { Caveat, Geist_Mono, Inter, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/install-app";
import { SignProgressHost } from "@/components/sign-progress";
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

const site = "https://rvessflow.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Rvess",
  description: "Beta. Your money, in motion on Base and Celo.",
  applicationName: "Rvess",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Rvess",
    description: "Beta. Savings, streams, locks, and groups. One account on Base and Celo.",
    url: site,
    siteName: "Rvess",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Rvess" }],
  },
  appleWebApp: {
    capable: true,
    title: "Rvess",
    statusBarStyle: "default",
    startupImage: [
      { url: "/splash/iphone-se.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/splash/iphone-14.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/ipad.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[#141414] focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <PwaRegister />
        <SignProgressHost />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Rvess",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              url: site,
              description: "Beta. Savings, streams, locks, and groups. One account on Base and Celo.",
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
