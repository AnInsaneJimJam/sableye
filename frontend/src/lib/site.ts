export const siteConfig = {
  name: "Sableye",
  title: "Sableye",
  description:
    "Stripe-grade USDT checkout for real businesses, on Whitechain. Twenty lines to integrate, non-custodial, and gasless for your customer.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en_US",
  twitter: "",
  links: {
    github: "https://github.com/AnInsaneJimJam/sableye",
    x: "",
  },
} as const;
