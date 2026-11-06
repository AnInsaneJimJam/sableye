import { Hero } from "@/components/sections/hero";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  description:
    "Sableye is a USDT checkout for real businesses on Whitechain. Twenty lines to integrate, non-custodial, and gasless for your customer.",
});

export default function HomePage() {
  return <Hero />;
}
