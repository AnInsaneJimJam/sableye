import type { Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { createMetadata } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/themes";
import { cn } from "@/lib/utils";
import "./globals.css";

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

export const metadata = createMetadata();

export const viewport: Viewport = {
  themeColor: "#080f1f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(fontSans.variable, fontDisplay.variable, fontMono.variable)}
    >
      <head>
        <script
          id="sableye-palette"
          // The script contains only our palette IDs and storage key, never user input.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider forcedTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
