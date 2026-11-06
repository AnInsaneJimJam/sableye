import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Page not found",
  description: "This page does not exist.",
});

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-6 py-24">
      <h1 className="font-semibold text-3xl tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">That page does not exist.</p>
      <Button render={<Link href="/" />} variant="outline">
        Back to home
      </Button>
    </div>
  );
}
