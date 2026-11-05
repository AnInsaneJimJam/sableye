// GET /api/csv → accountant-ready export.
import { merchant } from '@/lib/sableye'

export const dynamic = 'force-dynamic'
export async function GET() {
  const { indexer } = merchant()
  await indexer.poll()
  // <sableye:extra>
  const csv = indexer.exportCsv()
  // </sableye:extra>
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="sableye-payments.csv"' } })
}
