import type { Metadata, Viewport } from "next";
import { Bitter, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const bitter = Bitter({
  subsets: ["latin"],
  variable: "--font-bitter",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const favicon = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="8" fill="#0d1714"/>
    <path d="M14 12h36v40H14z" fill="none" stroke="#e6b85c" stroke-width="4"/>
    <path d="M23 22h21M23 31h15M23 40h18" stroke="#f4eedb" stroke-width="4"/>
  </svg>
`)}`;

export const metadata: Metadata = {
  title: {
    default: "Curio — Teach to test understanding",
    template: "%s · Curio",
  },
  description: "Teach an AI novice, inspect what it learned, and discover what your explanation missed.",
  applicationName: "Curio",
  icons: [{ rel: "icon", url: favicon, type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d1714",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bitter.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="site-wordmark" href="/" aria-label="Curio home">Curio</Link>
            <nav className="site-nav" aria-label="Primary navigation">
              <Link href="/compiler">Compiler</Link>
              <Link href="/review">Review</Link>
            </nav>
          </div>
        </header>
        <div className="app-frame">{children}</div>
      </body>
    </html>
  );
}
