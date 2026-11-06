import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type SeoInput = {
  title?: string;
  description?: string;
  path?: string;
};

/**
 * Builds a page's Metadata from the site defaults.
 * Call it with no argument in the root layout, and with overrides in a page.
 * Drop an opengraph-image file next to a route and Next.js attaches it on its own.
 */
export function createMetadata({
  title,
  description,
  path = "/",
}: SeoInput = {}): Metadata {
  const resolvedTitle = title
    ? `${title} | ${siteConfig.name}`
    : siteConfig.title;
  const resolvedDescription = description ?? siteConfig.description;
  const url = new URL(path, siteConfig.url).toString();

  return {
    metadataBase: new URL(siteConfig.url),
    title: resolvedTitle,
    description: resolvedDescription,
    applicationName: siteConfig.name,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      title: resolvedTitle,
      description: resolvedDescription,
    },
    twitter: {
      card: "summary_large_image",
      site: siteConfig.twitter,
      title: resolvedTitle,
      description: resolvedDescription,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
