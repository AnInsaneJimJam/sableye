import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DocsShell } from "@/components/docs-shell";
import "./globals.css";

const sans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-sans",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-mono",
  display: "swap",
});

const display = localFont({
  src: "./fonts/satoshi-variable.woff2",
  weight: "300 900",
  variable: "--font-display",
  display: "swap",
});

/** Browser chrome matches the frontend navy palette. */
export const viewport: Viewport = { themeColor: "#080f1f" };

/** Default search and browser metadata for the documentation site. */
export const metadata: Metadata = {
  title: { default: "Documentation — Sableye", template: "%s — Sableye Docs" },
  description:
    "Accept USDT on Whitechain. Guides and API reference for Sableye checkout, invoices, refunds, and subscriptions.",
};

/** Independent document shell with self-hosted fonts. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body>
        <DocsShell>{children}</DocsShell>
      </body>
    </html>
  );
}
