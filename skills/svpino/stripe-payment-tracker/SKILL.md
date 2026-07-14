---
name: stripe-payment-tracker
description: >-
  Find recent Stripe payment notifications in Gmail, look up each payment's
  invoice number on Stripe, record every new payment (date, invoice, email,
  amount) to a Google Sheet, and report a summary table. Runs incrementally so
  the same email is never processed twice, uses native Gmail/Stripe connectors
  with Zapier as a backup, and remembers the target spreadsheet between runs.
  Use when the user wants to track, record, or reconcile incoming Stripe
  payments (e.g. "log new Stripe payments", "record recent invoices to the
  sheet", "run the stripe tracker").
license: MIT
metadata:
  author: svpino
---

# Stripe Payments

Find recent Stripe payment notifications from Gmail, look up the corresponding invoice number on Stripe, record each new payment in a Google Sheet, and display a summary table. The skill is incremental: the same email is never processed twice.

## Requirements: Zapier MCP

**This skill cannot run without the Zapier MCP server.** The spreadsheet is read and written exclusively through Zapier's Google Sheets actions (the native Google Drive connector can't address cells or write), and Zapier is also the backup for Gmail and Stripe. The skill needs Zapier access to **Gmail**, **Google Sheets**, and **Stripe**.

If Zapier is unavailable at any point (no `mcp__zapier__*` tools, server disconnected, or those three apps not enabled), **stop and show the user these setup instructions verbatim — never attempt a partial run:**

> This skill needs the **Zapier MCP** server connected, with Gmail, Google Sheets, and Stripe enabled. To set it up:
>
> 1. Go to **https://mcp.zapier.com/** and sign in (a free Zapier account works).
> 2. Connect these three apps and enable their actions:
>    - **Gmail** — for finding the Stripe payment notification emails
>    - **Google Sheets** — for reading and writing the payments spreadsheet
>    - **Stripe** — for looking up invoice numbers
> 3. In the Zapier MCP dashboard, copy your **MCP Server URL** (or generate one if you don't have it yet).
> 4. Add that server to Claude Code as an MCP server named `zapier` (via `/mcp` → add server, or your MCP settings), and complete the authentication flow.
> 5. Re-run this skill.

## Tooling Policy

Use native connectors when they work; the moment a native connector is unavailable — **including when its OAuth token is expired / de-authenticated / returns an auth error** — **silently switch to that operation's Zapier backup and keep going.** This is automatic: never stop the run, and never ask the user to re-authenticate the native connector, just because a native connector is down. (Zapier itself is the one hard requirement — see "Requirements: Zapier MCP".) Just note the switch once in the tool announcement or inline. Exact native tool names can vary slightly by setup — use whatever native Gmail/Stripe tools are available that match these operations.

| Operation | Primary | Backup |
|-----------|---------|--------|
| Find + read payment emails | Native Gmail (`mcp__claude_ai_Gmail__search_threads`, `mcp__claude_ai_Gmail__get_thread`) | Zapier (`mcp__zapier__gmail_find_email`) |
| Look up invoice number | Native Stripe (`mcp__claude_ai_Stripe__search_stripe_resources`, `mcp__claude_ai_Stripe__fetch_stripe_resources`) | Zapier (`mcp__zapier__stripe_find_payment`) |
| Read / write the spreadsheet | Zapier (`mcp__zapier__google_sheets_make_api_get_request`, `mcp__zapier__google_sheets_make_api_mutating_request`) | — (Zapier required; never use native Google Drive — it can't address cells or write) |

## Spreadsheet Layout

- **Spreadsheet ID**: stored in `stripe.json` under `spreadsheet_id` — never hard-coded. (The ID is the long token in `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.)
- **Worksheet**: stored in `stripe.json` under `worksheet`; defaults to `Sheet1` (the default tab name of any new Google Sheet). The user can change it at any time by saying so (e.g., "use the Payments tab") — update `stripe.json` and use the new name from then on. If the configured tab doesn't exist in the spreadsheet, ask the user which tab to use (or to create it), and save their answer to `stripe.json`. In A1 ranges, single-quote the name when it contains spaces (e.g., `'My Payments'!A1:D1`).
- **Row 1** = titles `Date | Invoice | Email | Amount`; **row 2 and below** = one payment per row:
  - **A = Date** — payment date, `M/D/YYYY` (e.g., `3/13/2026`)
  - **B = Invoice** — invoice number (e.g., `NDTCNKHM-0001`), or `N/A` if none found
  - **C = Email** — customer email
  - **D = Amount** — plain number, no currency symbol (e.g., `1000.00`)

## State File

- Path: `stripe.json` (relative to the current working directory)
- Format (`worksheet` defaults to `Sheet1`; `lookback_days` is optional and defaults to `3`):
```json
{
  "spreadsheet_id": "<google sheets spreadsheet id>",
  "worksheet": "Sheet1",
  "lookback_days": 3,
  "processed_emails": [
    {
      "message_id": "<gmail message/thread id>",
      "date": "email date string",
      "payment_intent_id": "pi_...",
      "invoice_number": "NDTCNKHM-0001",
      "amount": "$100.00",
      "email": "sample@example.com"
    }
  ],
  "last_run": "ISO timestamp"
}
```

## Execution Steps

### Step 0: Check Zapier, Then Announce the Tools

Confirm the Zapier MCP server is available with its Google Sheets, Gmail, and Stripe actions. If not, stop and show the setup instructions from "Requirements: Zapier MCP". Then tell the user which tool you'll use for each operation, e.g.:

```
Tools for this run:
- Gmail: Native Connector   (backup: Zapier)
- Stripe: Zapier            (native connector unavailable)
- Spreadsheet: Zapier
```

If a native connector goes down mid-run, switch to its Zapier backup and note the switch.

### Step 1: Load State and Resolve the Spreadsheet

1. Read `stripe.json`. If it doesn't exist, initialize: `{"spreadsheet_id": null, "worksheet": "Sheet1", "processed_emails": [], "last_run": null}`.
2. If `spreadsheet_id` is missing/null/empty, **ask the user for it**, then save it to `stripe.json` immediately. Never ask again once stored.
3. Resolve the worksheet name: use `worksheet` from `stripe.json`, defaulting to `Sheet1` if absent. If the user asks to use a different tab (now or mid-conversation), save the new name to `stripe.json` and use it everywhere `{WORKSHEET}` appears below.
4. Note the already-processed message IDs and the lookback window (`lookback_days`, default 3).

### Step 2: Ensure the Header Row

Read `{WORKSHEET}!A1:D1`. If the read fails because the tab doesn't exist, ask the user which tab to use (or to create one), save the answer to `stripe.json`, and retry. If row 1 is empty, **write the titles yourself — do NOT ask the user to do it**: `PUT .../values/{WORKSHEET}!A1:D1?valueInputOption=USER_ENTERED` with `{"values": [["Date", "Invoice", "Email", "Amount"]]}`. If row 1 already has values, leave it unchanged.

### Step 3: Fetch Emails

1. Search with native Gmail: `query`: `from:notifications@stripe.com newer_than:{lookback_days}d`, `pageSize`: `20`. If more than 20 results come back, paginate until the window is covered.
2. Keep only subjects containing `Payment`; discard payouts (subject contains `payout`) and all other Stripe notifications.
3. Fetch each candidate's body with `messageFormat: FULL_CONTENT` and read `plaintextBody`. A single thread can contain **multiple messages — each message is a separate payment**; process every message individually.
4. **Backup:** if native Gmail is unavailable, use `mcp__zapier__gmail_find_email` with the same query and an `output_hint` requesting the message ID, subject, date, and full plain-text body of **every** match (bodies come back inline — no separate fetch). Apply the same subject filtering.

### Step 4: Filter Already-Processed Emails

Skip any message whose **message id** (fallback: date string + payment intent id) is already in `processed_emails`. If nothing new remains, update `last_run` in the state file, report "No new payments to process", and stop.

### Step 5: Parse Payment Details

From each new message's subject + `plaintextBody`:

1. **Amount** — from the subject (`Payment of $1,000.00 ...`) or body (`$1,000.00 — pi_...`). Amounts may be in any currency: strip the currency symbol and thousands separators and keep the number; if the currency is not USD, remember it for the report.
2. **Customer email** — from the body's Customer line (`john@example.com — cus_...`)
3. **Customer id** — the `cus_...` token on that line (may be absent)
4. **Payment intent id** — the `pi_...` token (body "Payment ID" section)
5. **Date** — the email's received date (this becomes column A)

### Step 6: Look Up Invoice Numbers

For each payment:

1. Convert the amount to minor units (cents): `$1,000.00` → `100000`.
2. **If native Stripe is available**, use `mcp__claude_ai_Stripe__search_stripe_resources` with `invoices:customer:'CUSTOMER_ID' AND total:CENTS`. The invoice number is the result's `title` (e.g., `2HFOFF3D-0001`); if several match, take the first. If the email had no `cus_...` id, first recover the customer via `fetch_stripe_resources(pi_...)` (that reduced view never includes the invoice itself).
3. **If native Stripe is de-authenticated or otherwise unavailable, don't stop and don't ask the user to re-auth — automatically use the Zapier backup** `mcp__zapier__stripe_find_payment` with the `pi_...` id and read the invoice's human-readable `number` (it also returns the customer email, handy when the body lacked it). A charge `receipt_number` (like `1234-5678`) is **not** an invoice number — treat it as no invoice found.
4. **A missing invoice is fine, not an error** (subscription charge, a Stripe account the connector isn't authorized for, Stripe down). Use `N/A`, still record the payment, and note the reason in the report.

### Step 7: Read the Sheet (dedup + next empty row)

Read `{WORKSHEET}!B1:B1000` (raw positional array: index 0 = B1 header, index 1 = B2 …). If all 999 slots are filled, read the next block (`B1001:B2000`) until you find a gap. This one read gives you:

- **Dedup data**: the invoice numbers already in column B.
- **Insertion row**: the first empty slot scanning down from B2. Records form one contiguous block from row 2; never infer the row from column A, previous runs, or the state file.

### Step 8: Dedup, Verify, Write

For each new payment:

1. **Dedup** — if its invoice number already appears in column B, mark it **"Already in sheet"** and skip. (Skip this check for `N/A` invoices — they aren't unique; the Step 4 message-id dedup covers them.)
2. **Verify before writing** — read the target range and confirm every cell is blank/`null`. If anything is non-empty, **stop and report — never overwrite data**. Consecutive rows may be verified and written as one range (e.g., `A22:D24`), one verify read + one write.
3. **Write** with `PUT .../values/{WORKSHEET}!A{ROW}:D{ROW}?valueInputOption=USER_ENTERED` and `{"values": [["M/D/YYYY", "INVOICE-NUMBER", "EMAIL", AMOUNT]]}` — columns per the Spreadsheet Layout section.

### Step 9: Update State

Append each newly processed message to `processed_emails` (message id, date, payment_intent_id, invoice_number, amount, email), set `last_run` to the current ISO timestamp, preserve `spreadsheet_id`, `worksheet`, and `lookback_days`, and write the file. Do this even for payments recorded as "Already in sheet".

### Step 10: Report Results

```
## Stripe Payments

| Date | Invoice | Email | Amount | Status |
|------|---------|-------|--------|--------|
| Feb 17, 2026 | COMPANYAB-0001 | john@companyabc.com | $1,500.00 | Added |
| Feb 21, 2026 | ANOTHER-0004 | jane@doe.com | $500.00 | Already in sheet |
| Feb 22, 2026 | N/A | sub@example.com | $7.00 | Added (invoice not found) |

New payments added to sheet: 2
Already in sheet (skipped): 1
Previously processed emails skipped: 0
```

- Dates as `Mon DD, YYYY`; amounts with currency symbol and two decimals (note the currency when not USD)
- When an invoice couldn't be found, use a status like `Added (invoice not found)` and briefly explain why below the table if known
- If no payment emails were found at all, report "No payment notifications found in the last {lookback_days} days"

## Rules

- **Zapier MCP is mandatory** — if missing, stop first and show the https://mcp.zapier.com/ setup instructions (Step 0)
- A de-authenticated or unavailable **native** connector (Gmail or Stripe) is **not** a reason to stop or ask the user to re-auth — automatically fall back to its Zapier backup and keep going
- Ask for the spreadsheet ID only when `stripe.json` doesn't have it; write the header row yourself when row 1 is empty
- The worksheet name comes from `stripe.json` (`worksheet`, default `Sheet1`); when the user picks a different tab, save it there so it sticks across runs
- Never process the same email twice; always read state before fetching and write state after processing
- A missing invoice number never stops the run — record `N/A` and note it
- Always read column B live immediately before writing, and verify target cells are empty — **never overwrite existing data**
