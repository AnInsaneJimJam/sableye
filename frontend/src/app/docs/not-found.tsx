import Link from "@/components/docs/docs-link";

/** Recovery page for unknown documentation routes. */
export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <p className="eyebrow">404</p>
      <h1>This page has moved off-chain.</h1>
      <p>
        We couldn't find that guide. Search the docs or start with the
        introduction.
      </p>
      <Link href="/" className="primary-button">
        Back to documentation
      </Link>
    </main>
  );
}
