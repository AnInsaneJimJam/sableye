// POST /api/relay → gasless checkout: submit the customer's EIP-3009 authorization and pay the WBT fee.
import { merchant } from '@/lib/sableye'

const handler = (req: Request) => merchant().sableye.relayHandler()(req)
// <sableye:extra>
export { handler as POST, handler as OPTIONS }
// </sableye:extra>
