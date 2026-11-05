export const siteConfig = {
  name: "Ethglobal",
  title: "Ethglobal",
  description:
    "Replace this sentence with the one line promise of your product. Search engines and social cards both read it.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en_US",
  twitter: "@ethglobal",
  links: {
    github: "",
    x: "",
  },
} as const;
