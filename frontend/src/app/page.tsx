export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-24">
      <h1 className="font-semibold text-3xl tracking-tight">Frontend ready</h1>
      <p className="max-w-prose text-muted-foreground">
        Next.js, Tailwind, shadcn/ui, motion and dark mode are wired up. Build
        your sections in
        <code className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          src/components/sections
        </code>
        .
      </p>
    </div>
  );
}
