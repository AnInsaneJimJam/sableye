import { errorResponse, sableye } from '../../../lib/sableye'

// The price is set here on the server. Never accept an amount from the browser.
export async function POST() {
  try {
    return Response.json(await sableye().invoices.create({ amount: '5.00' }))
  } catch (error) {
    return errorResponse(error)
  }
}
