# eBay Hardware Hunter

An agent skill that shops eBay for hardware on a budget, scores every listing for
deal quality, logs the results to a Zapier Table, and reports the best buy plus
backups with direct purchase links. It is built entirely on the
[Zapier SDK](https://docs.zapier.com/sdk), with no eBay developer keys and no
application code. The whole skill is a single `SKILL.md` runbook that any coding
agent (Claude Code, and similar) can follow.

> Watch the build walkthrough: **https://mrc.fm/hardwarehunter**

## Why it works this way

The native eBay app on Zapier is built for sellers (orders and fulfilment), so it
has no buyer side listing search. This skill reaches the buyer side
**eBay Browse API** through Zapier's authenticated `curl`, which injects your
connected eBay account's OAuth token. Everything stays inside the Zapier SDK.

```
search (eBay Browse API via Zapier curl)  ->  score  ->  log (Zapier Table)  ->  report best deal + backups
```

## Quickstart

1. **Install** Node.js 20 or newer, then the dependencies:
   ```bash
   npm install
   ```

2. **Log the SDK into Zapier** (browser auth, stored locally for your OS user):
   ```bash
   npx zapier-sdk login
   ```
   Confirm with `npx zapier-sdk get-profile`.

3. **Connect your eBay account** at https://zapier.com/app/connections, then
   **Add connection**, choose **eBay**, and authorize. Confirm with:
   ```bash
   npx zapier-sdk find-first-connection ebay --json
   ```

4. **Run the skill.** Point your agent at `SKILL.md` and ask it to hunt, for
   example *"find me a cheap Mac mini under 400 and log the deals"*. The agent
   resolves your eBay connection, searches, scores, logs to a Zapier Table, and
   reports the best deal with a direct buy link.

   To try the underlying call by hand (replace the connection id with yours):
   ```bash
   npx zapier-sdk curl \
     "https://api.ebay.com/buy/browse/v1/item_summary/search?q=mac%20mini&limit=15&sort=price&category_ids=111418&filter=price:%5B50..400%5D,priceCurrency:GBP,buyingOptions:%7BFIXED_PRICE%7D,conditions:%7BUSED%7CNEW%7D" \
     --connection <YOUR_EBAY_CONNECTION_ID> \
     -H "X-EBAY-C-MARKETPLACE-ID: EBAY_GB"
   ```

## Configuration

The skill reads its settings from your request and falls back to sensible
defaults (search query, marketplace, budget, condition, buying options, and the
table name). Change `QUERY` to hunt for anything: `rtx 4090`, `ddr5 64gb`,
`thinkpad x1`, and so on. The full table of knobs and the scoring rubric live in
[`SKILL.md`](./SKILL.md).

## What it does not do

It finds and records deals and hands you a purchase link. It does **not** place
bids or buy. eBay's API and the Zapier eBay app do not expose buyer bidding or
checkout, so completing a purchase stays a human click.

## Built on

- [Zapier SDK](https://docs.zapier.com/sdk) for authenticated access to eBay and
  Zapier Tables.
- [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html)
  for buyer side listing search, reached through Zapier.
