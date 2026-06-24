---
name: ebay-hardware-hunter
description: >-
  Hunt eBay for a target piece of hardware (default: Mac mini) on a budget,
  score every listing for deal quality, log them to a Zapier Table, and report
  the best buy plus backups with direct purchase links. Built entirely on the
  Zapier SDK CLI - no eBay developer keys, no app code. Use when the user wants
  to find, compare, or track hardware deals on eBay (e.g. "find me a cheap Mac
  mini", "hunt for compute", "what RAM upgrades are going on eBay", "log today's
  GPU deals").
license: MIT
metadata:
  author: mike-russell
---

# eBay Hardware Hunter

An agent skill that shops eBay for hardware on a budget, scores the listings,
and records them - all through the **Zapier SDK**. (Build walkthrough:
<https://mrc.fm/hardwarehunter>.) The native eBay Zapier app
is seller-focused (orders, fulfilment), so this skill reaches the **buyer-side
eBay Browse API** through Zapier's authenticated `curl`, which injects your
connected eBay account's OAuth token. Everything stays inside the Zapier SDK.

```
search (eBay Browse API via Zapier curl)  ->  score  ->  log (Zapier Table)  ->  report best deal + backups
```

## Prerequisites (one-time setup)

1. **Node.js 20+** and the Zapier SDK packages:
   ```bash
   npm install @zapier/zapier-sdk@^0.70.2 @zapier/zapier-sdk-cli@^0.55.3
   ```
   Every command below is run as `npx zapier-sdk <command>`.

2. **Log the SDK into Zapier** (browser auth, token stored locally for the OS
   user that runs it):
   ```bash
   npx zapier-sdk login
   ```
   Verify with `npx zapier-sdk get-profile`.
   > Headless box? The login prints an authorize URL and listens on
   > `localhost:<port>` for the callback. Open the URL, approve, then `curl` the
   > resulting `http://localhost:<port>/oauth?code=...&state=...` URL **from the
   > same machine** the CLI is running on to complete the handshake.

3. **Connect your eBay account to Zapier** at
   <https://zapier.com/app/connections> -> **Add connection** -> **eBay** ->
   sign in and authorize. This grant carries the base `api_scope` the Browse API
   needs. Confirm it exists:
   ```bash
   npx zapier-sdk find-first-connection ebay --json
   ```

## Configuration

Read these knobs from the user's request; fall back to the defaults.

| Setting          | Default        | Notes                                                        |
|------------------|----------------|--------------------------------------------------------------|
| `QUERY`          | `mac mini`     | eBay search keywords.                                        |
| `CATEGORY_ID`    | `111418`       | eBay category to restrict to (`111418` = Apple Desktops & All-in-Ones). Omit to search all categories. **Strongly recommended** - without it, accessories dominate (see relevance guard below). |
| `EXCLUDE`        | `box only, empty box, dock, hub, stand, case, shell, charger, cable, psu, power supply, lead, spares, faulty, screen protector, sticker, skin` | Title keywords that mean "not the actual machine". |
| `MARKETPLACE`    | `EBAY_GB`      | eBay marketplace id (`EBAY_US`, `EBAY_DE`, ...).             |
| `CURRENCY`       | `GBP`          | Must match the marketplace (`USD` for `EBAY_US`, etc.).      |
| `BUDGET`         | `400`          | Max total price (item) you'll consider, in `CURRENCY`.       |
| `MIN_PRICE`      | `50`           | Floor to skip junk/parts listings.                           |
| `CONDITIONS`     | `USED|NEW`     | eBay condition set: `NEW`, `USED`, `CERTIFIED_REFURBISHED`.  |
| `BUYING_OPTIONS` | `FIXED_PRICE`  | `FIXED_PRICE`, `AUCTION`, or `FIXED_PRICE|AUCTION`.          |
| `MAX_RESULTS`    | `15`           | Listings to fetch, score, and log.                           |
| `TABLE_NAME`     | `Mac mini deals` | Zapier Table to log into (created if missing).            |

## Procedure

### Step 1 - Resolve the eBay connection id
```bash
npx zapier-sdk find-first-connection ebay --json
```
Take `.data.id`. If `data` is null, stop and tell the user to connect eBay
(Prerequisite 3).

### Step 2 - Search eBay (Browse API through Zapier)
Build the Browse API URL and call it with `curl --connection <id>`, passing the
marketplace header. URL-encode the query and the `filter` value.

```bash
npx zapier-sdk curl \
  "https://api.ebay.com/buy/browse/v1/item_summary/search?q=mac%20mini&limit=15&sort=price&category_ids=111418&filter=price:%5B50..400%5D,priceCurrency:GBP,buyingOptions:%7BFIXED_PRICE%7D,conditions:%7BUSED%7CNEW%7D" \
  --connection <CONNECTION_ID> \
  -H "X-EBAY-C-MARKETPLACE-ID: EBAY_GB"
```

Notes for building the URL from config:
- `q=` URL-encoded `QUERY`.
- `category_ids=` `CATEGORY_ID` (omit the param entirely if `CATEGORY_ID` is blank).
- `limit=` `MAX_RESULTS` (max 200 per page).
- `sort=price` returns cheapest first.
- `filter=price:[MIN_PRICE..BUDGET],priceCurrency:CURRENCY,buyingOptions:{BUYING_OPTIONS},conditions:{CONDITIONS}`
  - encode `[` as `%5B`, `]` as `%5D`, `{` as `%7B`, `}` as `%7D`, `|` as `%7C`.
- Header `X-EBAY-C-MARKETPLACE-ID: MARKETPLACE`.

> **Relevance guard - do not skip this.** A bare keyword search for popular
> hardware is full of accessories and parts. `q=mac mini` alone surfaces docks,
> hubs, stands, and even "BOX only" listings that are cheap and therefore score
> as "great deals". Two defences, both applied: (1) `CATEGORY_ID` restricts the
> server-side search to actual machines; (2) the `EXCLUDE` keyword check in
> Step 3 drops anything whose title still betrays a non-machine.

The response is JSON with an `itemSummaries` array. For each item read:
`title`, `price.value`, `shippingOptions[0].shippingCost.value` (absent ->
treat as collection/unknown, default 0), `condition`, `buyingOptions`,
`seller.username`, `seller.feedbackPercentage`, `seller.feedbackScore`,
`marketingPrice.discountPercentage` (optional), `itemId`, and `itemWebUrl` (the
direct buy link).

### Step 3 - Score each listing (0-100)
First **drop irrelevant listings**: skip any item whose lowercased `title`
contains an `EXCLUDE` keyword (box only, dock, hub, stand, case, charger,
cable, etc.). This is what stops an empty "Mac Mini BOX only" from topping the
ranking.

Then compute `total = price + shipping` and skip anything with `total > BUDGET`.
Sum the components below (clamp the final score to 0-100). State the rubric to
the user so the ranking is transparent.

- **Value vs budget - up to 40.** `40 * (BUDGET - total) / BUDGET`. Cheaper
  relative to budget scores higher; at-budget scores ~0.
- **Seller trust - up to 25.** `25 * (feedbackPercentage / 100)`, then subtract
  up to 10 if `feedbackScore < 50` (thin track record). Floor at 0.
- **Condition - up to 15.** `NEW`/`Brand New` = 15; `Certified`/`Excellent -
  Refurbished` = 12; `Used`/`Very Good`/`Good` = 8; `For parts or not working`
  = 0.
- **Buying option - up to 10.** `FIXED_PRICE` (buy-it-now, instant) = 10;
  `FIXED_PRICE` **with** `BEST_OFFER` = 10 (+ note offer is possible);
  `AUCTION` = 5 (price not final).
- **Shipping - up to 10.** Free = 10; otherwise `10 * (1 - shipping / 20)`
  floored at 0 (i.e. >= 20 in shipping scores 0).
- **Discount bonus - up to 5.** If `marketingPrice.discountPercentage` present,
  add `min(5, discountPercentage / 10)`.

Sort listings by score descending. The top one is the recommended deal.

### Step 4 - Ensure the log table exists
```bash
npx zapier-sdk list-tables --json
```
Find a table whose `name` equals `TABLE_NAME`. If none exists, create it and its
fields (one-time):
```bash
npx zapier-sdk create-table "Mac mini deals" --description "eBay hardware hunter log"
# take .data.id from the output, then:
npx zapier-sdk create-table-fields <TABLE_ID> '[
  {"name":"title","type":"text"},
  {"name":"score","type":"number"},
  {"name":"price_gbp","type":"text"},
  {"name":"shipping_gbp","type":"text"},
  {"name":"total_gbp","type":"text"},
  {"name":"condition","type":"text"},
  {"name":"buying_options","type":"text"},
  {"name":"seller","type":"text"},
  {"name":"seller_feedback_pct","type":"text"},
  {"name":"seller_feedback_score","type":"number"},
  {"name":"url","type":"text"},
  {"name":"item_id","type":"text"},
  {"name":"found_at","type":"text"}
]'
```
> Money and percentage values are stored as **text** on purpose: Zapier Table
> `number` fields round to integers on write, which would turn `319.99` into
> `319`. Keep `score` and `seller_feedback_score` as `number`.

### Step 5 - Log the scored listings
Each record must be wrapped in `{"data": {...}}`. Write all scored listings
(up to 100 per call):
```bash
npx zapier-sdk create-table-records <TABLE_ID> '[
  {"data":{
    "title":"Apple Mac mini (2020) M1 256GB 8GB",
    "score":82,
    "price_gbp":"319.99",
    "shipping_gbp":"0.00",
    "total_gbp":"319.99",
    "condition":"Excellent - Refurbished",
    "buying_options":"FIXED_PRICE",
    "seller":"clove-technology",
    "seller_feedback_pct":"99.1",
    "seller_feedback_score":15282,
    "url":"https://www.ebay.co.uk/itm/267581736217",
    "item_id":"v1|267581736217|0",
    "found_at":"2026-06-15T16:45:00Z"
  }}
]'
```
Use the item's `itemWebUrl` for `url`. Set `found_at` to the current UTC time.

### Step 6 - Report to the user
Reply in chat with:
- **Best deal**: title, total price, condition, seller (feedback %), buy link,
  and one line on why it won (the scoring breakdown).
- **2-3 backups**: title, total, link.
- A line confirming how many listings were logged to the `TABLE_NAME` table.

This chat report is the "notification" (this skill is notification-channel
agnostic; see Extending below to fan out to Slack, etc.).

## Failure modes & fallbacks

- **`find-first-connection ebay` returns null** -> eBay isn't connected. Send
  the user to <https://zapier.com/app/connections>. Do not proceed.
- **Browse API returns `errorId` 1100/"Access denied" or HTTP 403** -> the
  connected eBay token lacks Browse scope. Reconnect eBay in Zapier; if it still
  fails, the account may need a fresh OAuth grant. (In testing, a standard eBay
  connection carries the base `api_scope` the Browse search needs.)
- **`"total": 0` / empty `itemSummaries`** -> loosen the filter: widen `BUDGET`,
  add `AUCTION` to `BUYING_OPTIONS`, or broaden `CONDITIONS`. Report the empty
  result honestly rather than inventing listings.
- **Auth error on any `zapier-sdk` call** -> run `npx zapier-sdk login` as the
  OS user that will run the skill (the token is per-user).

## Known limitations

- The Browse API item summary does **not** expose watcher counts or bid counts,
  so those are not scored or logged.
- This skill **finds and records** deals and hands you a purchase link - it does
  **not** place bids or buy. eBay's API and the Zapier eBay app do not expose
  buyer bidding/checkout, so completing a purchase stays a human click. (This
  matches the "prepare checkout / deep link" approach.)

## Extending

- **Other hardware**: change `QUERY` (e.g. `rtx 4090`, `ddr5 64gb`, `thinkpad
  x1`). Tune `BUDGET`/`CONDITIONS` to match.
- **Other notification channels**: any Zapier-connected app can be the alert.
  After Step 6, e.g. Slack:
  ```bash
  npx zapier-sdk run-action slack write create_message \
    --inputs '{"channel":"#deals","text":"Best Mac mini lead: ..."}'
  ```
  (Requires a Slack connection. Discover inputs with
  `npx zapier-sdk get-action-input-fields-schema slack write create_message`.)
- **Scheduling**: run this skill on a cron to hunt daily and keep the table as a
  running price history.

<!-- SPDX-License-Identifier: MIT -->
<!-- Licensed under the MIT License. -->
<!-- Attribution: Mike Russell (mike-russell) -->
