---
name: unpaid-invoice-nudge
description: Build a Zapier Next Gen Zap that follows up on every new invoice. 3 days after the due date, if it's still unpaid, AI writes a short, polite reminder in the owner's voice and Gmail sends it to the customer. On day 7, if it's still unpaid, SMS by Zapier texts the owner who owes what. Use when a service business owner wants invoices chased without doing it by hand. Works with QuickBooks Online, or any billing tool that can send a webhook.
license: MIT
metadata:
  author: andrewckor
---

# Unpaid invoice nudge

## What it does
1. **Trigger:** QuickBooks Online **New Invoice**. For any other billing tool (Stripe, FreshBooks, Square, a form, a spreadsheet), use a Webhooks by Zapier **Catch Hook** instead. One trigger per workflow; the code handles both payload shapes, including messy field names.
2. **Wait** (a durable `ctx.wait`, the run is saved while it waits) until **3 days after the due date**.
3. **Check the invoice again.** QuickBooks path: **Find Invoice** by id, unpaid while `Balance > 0`. Webhook path: see "Webhook status check" below. **Paid means the run stops.**
4. **AI by Zapier** writes a short, polite reminder in the owner's voice with the customer's first name, invoice number, amount, due date and pay link. No guilt trip, no invented links.
5. **Gmail** sends it to the customer from the owner's address.
6. **Wait 4 more days** (day 7) and **check again**. Paid means stop.
7. **Still unpaid:** **SMS by Zapier** texts the owner, e.g.
   ```
   Dana K. still owes $480 on #1042, 7 days late.
   ```

Sample reminder email (from a real test run):
```
Subject: Friendly reminder: Invoice #1042

Hi Dana,

I wanted to send a quick reminder that invoice #1042 for $480 was due Oct 13. I know these things can slip through the cracks. You can pay here:
https://pay.example.com/i/1042

Thanks,
Sam
```

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a private Next Gen Zap from `workflow.ts` in this folder. Use the file as written, then set the constants at the top (see Ask the user).
2. Trigger, pick one:
   - **QuickBooks Online:** New Invoice (`QuickBooksV3CLIAPI`, `invoice_v2`, no params) with the user's QuickBooks Online connection as the trigger's authentication.
   - **Any other billing tool:** Webhooks by Zapier, Catch Hook (`WebHookCLIAPI`, `hook_v2`, no auth). The billing tool POSTs the invoice as JSON (customer name, customer email, invoice number, amount or balance due, due date, pay link, status).
3. Bind connections:
   - `gmail_owner`: the Gmail account the reminders go out from
   - `sms_owner`: SMS by Zapier (the owner's verified number)
   - `quickbooks`: the QuickBooks Online connection (QuickBooks path only; used by Find Invoice, `QuickBooksV3CLIAPI`, search `invoice`)
4. Test with the steps below, then turn it on. If using the catch hook, give the user their webhook URL.

## Ask the user
- Where do invoices live: QuickBooks Online, or another tool that can send a webhook?
- Which Gmail account should the reminders come from? (`gmail_owner`, plus `BUSINESS_NAME` as the from name)
- How do you sign and sound? (`OWNER_NAME`, `OWNER_VOICE`, e.g. "Maria, owner. Warm, direct, first names, no fluff.")
- Which phone gets the day-7 text? (Set it in the SMS by Zapier connection, not in the code.)

## Webhook status check
The webhook path has no app to re-check, so pick one:
- **Default:** the run uses the status the webhook sent (`status: "paid"` or a balance of 0 stops it). Good for tools that only fire on unpaid invoices.
- **Better:** set `STATUS_CHECK_URL` (or send `status_url` in the payload) to a URL that returns the invoice's current status as JSON, like `{"balance": 0}` or `{"status": "paid"}`. `{invoice}` in the URL is replaced with the invoice id or number. Both checks call it.
- **Or:** use your billing tool's own Zapier "find invoice" search in place of the check step, the same way the QuickBooks path does.

## Test
### 1. Webhook sample
Run the workflow with these two payloads (field names messy on purpose). `remind_wait_seconds` and `escalate_wait_seconds` shorten both waits to 60 seconds; leave them out in real use. Use your own email address as the customer email.
```json
{"Customer":"Dana Kowalski","cust e-mail":"you@example.com","Invoice #":"1042","Amt Due":"$480.00","due":"2026-10-13","pay here":"https://pay.example.com/i/1042","Status":"open","remind_wait_seconds":60,"escalate_wait_seconds":60}
```
```json
{"client":"Dana Kowalski","email_addr":"you@example.com","inv_no":"#1043","total":"480","Due Date":"Oct 13, 2026","payment_link":"https://pay.example.com/i/1043","status":"Paid","remind_wait_seconds":60,"escalate_wait_seconds":60}
```
Expect: the unpaid one waits, checks, drafts, emails the reminder to your inbox, waits again, checks, and texts the owner `Dana K. still owes $480 on #1042, N days late.` The paid one waits, checks, and stops with `paid before reminder`: no email, no text.

### 2. Real test from QuickBooks Online
The webhook sample proves the logic, not the QuickBooks trigger or Find Invoice. **This path is untested so far.** To test it:
1. Connect QuickBooks Online in Zapier (a QuickBooks sandbox company from the Intuit Developer portal is ideal, so no real customer gets an email).
2. Create a test customer whose email is your own address, then an invoice for them with a due date in the past.
3. Pull it with the trigger's test / "find new records", and run the workflow on that record with `remind_wait_seconds` and `escalate_wait_seconds` added as 60.
4. Check each step: the code reads `DocNumber`, `CustomerRef.name`, `BillEmail.Address`, `Balance`, `DueDate` and `InvoiceLink`; Find Invoice returns the invoice and its `Balance`; the reminder lands in your inbox; the owner text arrives. Then mark the invoice paid, run it again, and confirm it stops at the first check.
5. Only call it done when this real run passes. Until then, tell the user the QuickBooks path is untested.

## Customize
- **Timing:** `REMIND_AFTER_DAYS` (default 3) and `ESCALATE_AFTER_DAYS` (default 7), both counted from the due date
- **Voice and length:** `OWNER_VOICE`, `OWNER_NAME`, and the rules in the AI `instructions`
- **No pay link?** QuickBooks only includes `InvoiceLink` when online payments are on. Without one, the email tells the customer to reply for payment options.
- **A second reminder to the customer:** copy the draft and email steps after the second wait, with a firmer tone

## Notes
- Paid at either check means the run stops. Nothing goes out for paid invoices.
- The waits are durable: the run is saved and resumes on time. Long waits (net-30 invoices wait about 33 days for the first reminder) have not been tested here; if your account caps run length, trigger on QuickBooks **New Invoice Due** or run a daily schedule that checks overdue invoices instead.
- A reminder needs a customer email on the invoice. Without one, the run stops with `no customer email on the invoice`.
- SMS by Zapier texts only the verified owner number. Use Twilio or OpenPhone to text customers.
- Never commit a real webhook URL, email address or phone number.
