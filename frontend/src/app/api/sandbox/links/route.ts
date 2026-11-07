import { connection } from "next/server";
import QRCode from "qrcode";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";
import { fileLinkStore, links } from "@/lib/sandbox/store";

/** GET → saved links with QR codes and status. */
export const GET = () =>
  handle(async () => {
    await connection();
    const store = fileLinkStore();
    return json(
      await Promise.all(
        links.all().map(async (l) => ({
          ...l,
          active: !(await store.isDeactivated(l.id)),
          qr: await QRCode.toDataURL(l.url, {
            margin: 1,
            width: 280,
            color: { dark: "#080f1f", light: "#f8fafc" },
          }),
        })),
      ),
    );
  });

/** POST { name, amount } → a reusable payment link (signed, nothing on-chain). */
export const POST = (req: Request) =>
  handle(async () => {
    const { name, amount } = (await req.json()) as {
      name?: string;
      amount?: string;
    };
    const link = await merchant().sableye.paymentLinks.create({
      amount: amount || "1.00",
      name: name?.slice(0, 40) || "Consulting hour",
    });
    links.add({
      id: link.id,
      name: link.name,
      amount: link.amount,
      token: link.token,
      url: link.url,
      createdAt: Date.now(),
    });
    return json(link);
  });
