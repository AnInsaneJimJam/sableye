import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="w-full border-border/60 border-t">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-6">
        <p className="text-muted-foreground text-xs">
          {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
