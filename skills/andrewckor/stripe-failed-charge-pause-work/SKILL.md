---
name: stripe-failed-charge-pause-work
description: Build a Zapier Next Gen Zap that handles a failed client card payment end to end. A Stripe failed payment has AI by Zapier write a friendly card-update email in the owner's voice, sends it from Gmail, alerts the team in Slack to pause work on that client, waits 48 hours, checks the invoice in Stripe again, and texts the owner with SMS by Zapier only if it is still unpaid. Use when an agency or service business keeps working for clients whose cards failed and nobody notices for weeks. Businesses that charge one-off payments instead of invoices can swap the trigger for Stripe Failed Payment.
license: MIT
metadata:
  author: andrewckor
---

# Stripe failed charge, pause work

## What it does
1. **Trigger:** Stripe **Invoice Payment Failed** (`StripeCLIAPI`, `invoice_payment_failed`), with the user's Stripe connection as the trigger's authentication.
2. **AI by Zapier** (`AICLIAPI`, `get_completion`) writes a short, friendly email in the owner's voice: first name, invoice number, exact amount, the payment link if Stripe sent one, and a subject line. It never invents a link, amount or reason, and never mentions pausing work.
3. **Gmail** (`GoogleMailV2CLIAPI`, `message`) sends it to the client's email from the owner's account. No client email on the invoice: the step is skipped and the Slack alert says so.
4. **Slack** (`SlackCLIAPI`, `channel_message`) posts to `SLACK_CHANNEL_ID`, e.g.:
   ```
   Pause work: Dana W.
   Card payment of $1,200.00 failed on #1042.
   Card-update email sent. I will check again in 48 hours and text the owner if it is still unpaid.
   Invoice: https://invoice.stripe.com/...
   ```
5. **Wait** 48 hours (`ctx.wait`, `WAIT_HOURS`).
6. **Recheck:** looks the invoice up in Stripe (`find_invoice`). If it is paid, void, uncollectible or has nothing left to pay, the run stops and nothing is texted.
7. **SMS by Zapier** (`SMSCLIAPI`, `send_v2`) texts the owner's verified number: `Dana W. still hasn't paid $1,200.00 on #1042. Work is paused until the card is fixed.`

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a private Next Gen Zap from `workflow.ts` in this folder. Use the file as written, then set the constants at the top (see Ask the user).
2. Set the trigger to Stripe Invoice Payment Failed (`StripeCLIAPI`, `invoice_payment_failed`) with the user's Stripe connection as the trigger's authentication.
3. Bind connections:
   - `stripe`: the user's Stripe account (same one as the trigger)
   - `gmail_owner`: the Gmail account the email should come from
   - `slack_team`: the Slack account that posts to the team
   - `sms_owner`: SMS by Zapier, which texts the owner's verified number
   - AI by Zapier needs no connection (managed `authentication_id: "0"`).
4. Test with the steps below, then turn the workflow on.

## Ask the user
- Which Slack channel gets the pause-work alert? Use its channel ID (channel menu, About, bottom of the panel), not the name. Set `SLACK_CHANNEL_ID`.
- What is the business name and the owner's first name? (`BUSINESS_NAME`, `OWNER_NAME`; the email is signed with the owner's name.)
- How should the email sound? Adjust `OWNER_VOICE`.
- How long before the recheck? (`WAIT_HOURS`, default 48)
- Do they take one-off card payments instead of invoices? See Customize.
- Is the SMS number verified in SMS by Zapier? It only texts the account owner's verified number.

## Test
### Sample payload
```json
{"id":"in_1SampleFake0042","object":"invoice","number":"1042","status":"open","paid":false,"currency":"usd","amount_due":120000,"amount_remaining":120000,"amount_remaining_formatted":"$1,200.00","attempt_count":1,"customer_name":"Dana Whitfield","customer_email":"dana.whitfield@example.com","hosted_invoice_url":"https://invoice.stripe.com/i/sample/test_1042","wait_seconds":20}
```
Replace `customer_email` with an address you can read, such as the tester's own. `wait_seconds` is optional test input that replaces the 48 hour wait. Leave it out for real runs.

### Run it
1. Connect Stripe, Gmail, Slack and SMS by Zapier in Zapier. Bind the four aliases and set the Stripe trigger's authentication.
2. Set `SLACK_CHANNEL_ID` to a test channel or a channel that only the tester is in.
3. Run the workflow on the sample payload.
4. Check each step:
   - `draft-card-update-email` returns a subject and a body that name the invoice number and `$1,200.00`.
   - `email-client-card-update` returns a Gmail message id, and the email arrives in the address you used.
   - `alert-team-to-pause-work` posts the alert in the Slack channel.
   - `wait-before-recheck` resumes after `wait_seconds`.
   - `recheck-stripe-invoice` returns `found: false, resolved: false`, because the sample invoice id is not in Stripe, so the run continues.
   - `text-owner-still-unpaid` sends the text and the run ends with `texted: true`.
5. **Paid guard:** run the workflow on a real invoice id from the user's Stripe that is already paid or void, with `wait_seconds` set to 20. Expect `stopped: "invoice is paid"` (or `void`) and no text.
6. **Native trigger:** with the Stripe connection bound, pull a recent record from the trigger's sample data, or fail a test payment in Stripe, and confirm the workflow starts and the same steps run. Use a test client email you control.
7. Call it done when these runs pass.

## Customize
- **One-off payments, not invoices:** swap the trigger for Stripe **Failed Payment** (`failed_payment`). The reader looks for the same fields (email, name, amount). The recheck needs an `in_` invoice id, so with no invoice id the run texts the owner after the wait. Add a Stripe charge lookup in `recheck-stripe-invoice` if you want a recheck there too.
- **Wait:** `WAIT_HOURS`.
- **Email tone and length:** `OWNER_VOICE` and the AI `instructions`.
- **Alert wording or private channel:** the `alert` text. For a private channel, look up the Slack app's private channel message action key with Zapier MCP and use it in the Slack step.
- **Text a team member, not the owner:** SMS by Zapier only texts the owner's verified number. Use Twilio or OpenPhone to text anyone else.
- **Late fees or a stronger second email:** add a step after the recheck. Keep the first email free of threats.

## Notes
- Stripe can retry a failed card on its own schedule, and each failed attempt can fire the trigger. A client can get one email per failed attempt. Turn off Smart Retries, or add a check on `attempt_count`, if that is not what you want.
- A client who fixes their card during the wait is caught by the recheck, and nobody is texted.
- Amounts: Stripe sends whole cents. `amount_remaining_formatted` is used when present; a value with a decimal point is treated as dollars.
- Rerunning on the same invoice sends the email, alert and text again.
- Never commit real Slack channel IDs, emails, invoice ids or webhook URLs.
