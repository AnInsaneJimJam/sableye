"use client";
// Hosted checkout for payment links: the signed invoice rides in the URL fragment (#…), which never reaches a server.
import { decodeSignedInvoice } from "@sableye/core";
import { Checkout } from "@sableye/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import "../sandbox/sandbox.css";

export default function PayPage() {
  const [hash, setHash] = useState<string | null>(null);
  const [tx, setTx] = useState<string>();
  useEffect(() => {
    const read = () => setHash(location.hash.slice(1));
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  let order = "";
  try { if (hash) order = decodeSignedInvoice(hash).invoice.orderId; } catch { /* <Checkout/> shows the error */ }
  return (
    <div className="sbx-page sbx-pay">
      <div className="sbx-glow" aria-hidden="true" />
      <main className="sbx-pay-card">
        <Link href="/" className="wordmark"><span className="brand-symbol" aria-hidden="true">s</span>Sableye<span className="brand-period">.</span></Link>
        <h1>Complete your payment</h1>
        {hash === null ? null : !hash ? (
          <p className="sbx-muted">This page needs a payment link. Ask the merchant for one.</p>
        ) : tx ? (
          <div className="sbx-note sbx-note-ok"><div><b>Paid.</b> <a className="sbx-link" href={`https://explorer.testnet.whitechain.io/tx/${tx}`} target="_blank" rel="noreferrer">View transaction</a> <span className="sbx-muted">Order {order.slice(0, 10)}…</span></div></div>
        ) : (
          <div className="sbx-checkout"><Checkout key={hash} invoice={hash} onSuccess={({ txHash }) => setTx(txHash)} /></div>
        )}
        <p className="sbx-hint">Non-custodial: the payment goes straight to the merchant&apos;s wallet. <Link href="/sandbox">Explore the sandbox</Link></p>
      </main>
    </div>
  );
}
