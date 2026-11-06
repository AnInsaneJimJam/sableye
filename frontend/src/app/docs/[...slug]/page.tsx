import type { Metadata } from "next";
import Link from "@/components/docs/docs-link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { PageActions, TableOfContents } from "@/components/docs/article-tools";
import { CodeBlock } from "@/components/docs/code-block";
import { getPage, pageMarkdown, pages } from "@/lib/docs/content";

/** Pre-render every guide while preserving real nested URLs. */
export function generateStaticParams() {
  return pages.map((page) => ({ slug: page.slug.split("/") }));
}
/** Give each guide its own title and description. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const page = getPage((await params).slug.join("/"));
  return page
    ? {
        title: page.title,
        description: page.description,
        alternates: { canonical: `/docs/${page.slug}` },
      }
    : { title: "Page not found" };
}

/** Render a guide with an outline, page actions, and adjacent-page navigation. */
export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const page = getPage((await params).slug.join("/"));
  if (!page) notFound();
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return (
    <main id="main-content" className="article-layout" key={page.slug}>
      <TableOfContents
        sections={page.sections.map(({ id, title }) => ({ id, title }))}
      />
      <article className="article">
        <header className="article-header">
          <p className="eyebrow">{page.group}</p>
          <div className="article-title-row">
            <h1>{page.title}</h1>
            <PageActions markdown={pageMarkdown(page)} slug={page.slug} />
          </div>
          <p className="article-description">{page.description}</p>
        </header>
        {page.sections.map((section) => (
          <section className="article-section" id={section.id} key={section.id}>
            <h2>
              <a href={`#${section.id}`}>
                {section.title}
                <span className="heading-anchor" aria-hidden="true">
                  #
                </span>
              </a>
            </h2>
            <p>{section.body}</p>
            {section.code && (
              <CodeBlock code={section.code} language={section.language} />
            )}
            {section.note && (
              <aside className="callout">
                <Info size={18} />
                <p>{section.note}</p>
              </aside>
            )}
            {section.table && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {section.table.headers.map((heading) => (
                        <th key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <nav className="pagination" aria-label="Previous and next pages">
          <Link href={previous ? `/${previous.slug}` : "/"}>
            <ArrowLeft size={16} />
            <span>
              <small>Previous</small>
              {previous?.title ?? "Introduction"}
            </span>
          </Link>
          {next && (
            <Link href={`/${next.slug}`} className="next-page">
              <span>
                <small>Next</small>
                {next.title}
              </span>
              <ArrowRight size={16} />
            </Link>
          )}
        </nav>
        <footer className="docs-footer">
          <span>Sableye documentation</span>
          <Link href="/errors">
            Need help? Read the troubleshooting guide <ArrowRight size={13} />
          </Link>
        </footer>
      </article>
    </main>
  );
}
