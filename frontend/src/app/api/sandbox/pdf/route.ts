import { connection } from "next/server";
import { fail } from "@/lib/sandbox/http";
import { merchant, SANDBOX_PREFIX } from "@/lib/sandbox/merchant";

/** GET ?kind=invoice|receipt&ref=<orderRef> → the PDF. Receipts never include customer details (anyone with the ref can fetch them). */
export async function GET(req: Request) {
  await connection();
  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref") ?? "";
    const kind =
      url.searchParams.get("kind") === "receipt" ? "receipt" : "invoice";
    if (!ref.startsWith(SANDBOX_PREFIX))
      return fail(
        { code: "not_found", message: "Only sandbox orders have PDFs here." },
        404,
      );
    const { sableye } = merchant();
    const pdf =
      kind === "invoice"
        ? await sableye.documents.invoicePdf(ref)
        : await sableye.documents.receiptPdf(ref);
    if (!pdf)
      return fail(
        {
          code: "not_paid",
          message: "No receipt yet: the chain doesn't show this order as paid.",
        },
        404,
      );
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${kind}-${ref}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e, 404);
  }
}
