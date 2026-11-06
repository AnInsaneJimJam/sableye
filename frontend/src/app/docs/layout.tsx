import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";
import "./docs.css";

/** Default search and browser metadata for the documentation site. */
export const metadata: Metadata = {
  title: { default: "Documentation — Sableye", template: "%s — Sableye Docs" },
  alternates: { canonical: "/docs" },
  description:
    "Accept USDT on Whitechain. Guides and API reference for Sableye checkout, invoices, refunds, and subscriptions.",
};

/** Documentation shares the website root and self-hosted fonts. */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsShell>{children}</DocsShell>;
}
