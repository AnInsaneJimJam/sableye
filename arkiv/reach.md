# Reach

**Who writes:** every merchant running `@sableye/server` with `ARKIV_ACCESS_KEY` set. That's one environment variable, offered during `npx sableye init`. Records are a side effect of taking payments; the merchant never has to "use Arkiv".

**Who reads**, all without asking us:
- **Accountants and bookkeepers:** the Books page or any tool built on `arkiv/schema.md`. Totals, a CSV, and on-chain verification of every line.
- **Tax and compliance tools:** query by merchant and `paid_at` range for a period's revenue; refunds are separate records.
- **Lenders and revenue-based financing:** verified revenue history straight from the merchant's own records, checked against Whitechain. No screenshots, no API access to a processor.
- **The merchant's other apps:** a storefront, an ERP or a dashboard. They read the same open records instead of integrating with Sableye.

**Why it spreads:** the schema is open and small (3 entity types, documented in one file), and readers need nothing from us. Every Sableye merchant adds verified commerce data that any Arkiv app can build on.

**Today:** this runs on Whitechain Sepolia and Arkiv's "Rabdi" testnet. USDT is the only prize-eligible token, and official USDT isn't on Whitechain mainnet yet, so production use waits for that.
