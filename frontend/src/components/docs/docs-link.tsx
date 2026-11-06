import Link from "next/link";
import type { ComponentProps } from "react";

/** Keep documentation navigation under /docs inside the unified website. */
export default function DocsLink({
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const target =
    typeof href === "string" &&
    href.startsWith("/") &&
    !/^\/docs(?:\/|$)/.test(href)
      ? `/docs${href === "/" ? "" : href}`
      : href;
  return <Link href={target} {...props} />;
}
