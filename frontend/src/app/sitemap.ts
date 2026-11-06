import type { MetadataRoute } from "next";
import { pages } from "@/lib/docs/content";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.url,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["", ...pages.map((page) => `/${page.slug}`)].map((path) => ({
      url: `${siteConfig.url}/docs${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
