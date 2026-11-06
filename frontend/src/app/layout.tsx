import type { Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { createMetadata } from "@/lib/seo";
import { SITE_THEME } from "@/lib/themes";
import { cn } from "@/lib/utils";
import "./globals.css";
import "./landing-backgrounds.css";

// Bundle fonts so first-time compilation does not wait for Google Fonts.
const fontSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});

// Satoshi carries the wordmark and the line under it. Self-hosted, so the
// build and the first paint never wait on a font CDN.
const fontDisplay = localFont({
  src: "./fonts/satoshi-variable.woff2",
  weight: "300 900",
  variable: "--font-display",
  display: "swap",
});

const fontMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "100 900",
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  ...createMetadata(),
  icons: {
    icon: { url: "/logo.svg", type: "image/svg+xml" },
  },
};

export const viewport: Viewport = {
  themeColor: SITE_THEME.glass.void,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="midnight"
      data-background="gradient-waves"
      suppressHydrationWarning
      className={cn(fontSans.variable, fontDisplay.variable, fontMono.variable)}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider forcedTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
