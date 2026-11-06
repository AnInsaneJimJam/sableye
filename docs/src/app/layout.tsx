import type { Metadata } from "next";
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <DocsShell>{children}</DocsShell>
      </body>
    </html>
  );
}
