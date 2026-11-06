# Why Arkiv

**The problem:** a business's sales history usually lives in its payment processor's database. To read its own books, the merchant needs the processor's API, keys and permission. An accountant, a tax tool or a lender needs all three plus a custom export. If the processor closes the account or shuts down, the history is locked or gone.

**What Arkiv changes:** Sableye writes each paid invoice and refund to Arkiv, **signed by the merchant's own key**. That gives three things:
- **The merchant's wallet is the owner.** We don't hold their data, and we couldn't delete or edit it.
- **Anyone can query it.** `ownedBy(merchant)` returns the merchant's records with no Sableye server, account or API key involved. Our Books page (`/sandbox/books`) does exactly that from the browser, with no Sableye code.
- **It's an open format.** `arkiv/schema.md` is the whole contract, so any app can implement it in an afternoon.

**Why not just a database or a file?**

| | Our own Postgres | A CSV export | Arkiv |
|---|---|---|---|
| Who owns the records | us | whoever has the file | **the merchant's wallet** |
| Third-party access | our API + permission | someone emails it | **query by address** |
| Survives us shutting down | no | a stale copy | **yes, still queryable** |
| Tamper evidence | trust us | none | **signed writes, each linked to an on-chain tx** |
| Structured queries | yes | no | **yes (indexed columns)** |

**Why not put it all on Whitechain?** The payments already are on-chain, but the *business context* isn't: which order, what was sold, to whom. Putting that on a payments chain is expensive and public. On Arkiv it's cheap, queryable, and encrypted where it should be private.

**Postgres still has a job:** hot operational state (the indexer cursor, webhook retries, the email outbox) stays local, because it needs millisecond writes and nobody else needs to read it. Arkiv is the **system of record that leaves the building**.
