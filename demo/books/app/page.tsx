// Independent accountant app. It must NEVER import @sableye/*: it reads merchant records straight from Arkiv
// using the open sableye.payment.v1 schema. This proves the records are usable without Sableye.
export default function Home() {
  return <main><h1>Books</h1><p>Enter a merchant address to load their sales from Arkiv: coming soon.</p></main>
}
