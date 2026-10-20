---
name: google-review-reply-draft
description: Build a Zapier Next Gen Zap that drafts a reply to every new Google (or Yelp, Facebook, any site) review in the owner's voice and emails it to the owner to approve, texts the owner on 1 or 2 stars, and logs 5-star reviews to a Testimonial Tuesday sheet. Use when a business owner wants help replying to reviews without auto-posting anything.
license: MIT
metadata:
  author: andrewckor
---

# Google review reply draft

## What it does
1. **Triggers:** Google Business Profile **New Review**, and/or a Webhooks by Zapier **Catch Hook** that any other review site, form, or scraper can POST to. The code handles both payload shapes, including messy field names.
2. **AI by Zapier** reads the review and returns the reviewer (first name, last initial), stars, source, review text, link, a pull quote, a short SMS alert, and a **reply draft**: 2 to 4 sentences in the owner's voice that references one specific detail from the review. No "Thank you for your review" openers, no emojis.
3. **Gmail** emails the owner the review and the draft. **Nothing is posted publicly.** The owner edits it and posts it on the review. That email is the approval step.
4. **1 or 2 stars:** SMS by Zapier texts the owner right away, e.g.
   ```
   1-star Yelp review from Sam T.: 9am tune-up arrived near noon, no call; took the morning off work.
   ```
5. **5 stars:** Google Sheets adds a row to **Testimonial Tuesday** (date, reviewer, stars, source, pull quote, full review, reply draft, link).

Sample email for a 5-star review:
```
Subject: ★★★★★ Dana K. on Google: reply draft ready

"AC died during the heat wave and Marcus was at our house within two hours. He showed me the burnt capacitor ... Fair price too."

Suggested reply (edit it, then post it on the review):

Dana, I'm glad Marcus could get there within two hours and show you the burnt capacitor before laying out the options. Thanks for trusting us to get the AC running before dinner, and I'm happy the price felt fair. Hope you stay cool.
```

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a private Next Gen Zap from `workflow.ts` in this folder. Use the file as written, then set the two constants at the top (see Ask the user).
2. Trigger: Webhooks by Zapier, Catch Hook (`WebHookCLIAPI`, `hook_v2`, no auth). For Google reviews, add Google Business Profile **New Review** (`GoogleMyBusinessCLIAPI`, `new_review_v3`, param `location`) with the user's Google Business Profile connection. If your surface allows only one trigger per workflow, use Google Business Profile for Google-only owners and the catch hook for everything else (or deploy the same code twice).
3. Bind connections:
   - `gmail_owner`: the Gmail account that sends the draft email
   - `sms_owner`: SMS by Zapier (the owner's verified number)
   - `sheets_testimonials`: the Google Sheets account that owns the Testimonial Tuesday sheet
4. Create the sheet if it doesn't exist: a spreadsheet named **Testimonial Tuesday** with headers `Date, Reviewer, Stars, Source, Pull quote, Full review, Reply draft, Review link` (Google Sheets "Create Spreadsheet" works). Put its ID in `TESTIMONIAL_SHEET_ID`.
5. Test with the payloads below, then turn it on. If using the catch hook, give the user their webhook URL.

## Ask the user
- Which email should get the reply drafts? (`OWNER_EMAIL`)
- How do you sound when you reply? (edit `OWNER_VOICE`, e.g. "Brad, owner. Casual, thanks people by name, mentions the tech.")
- Where do reviews come from: Google only, or other sites too?
- Which phone gets 1 and 2 star alerts? (Set it in the SMS by Zapier connection, not in the code.)

## Test
POST two samples to the trigger (field names messy on purpose):
```json
{"Reviewer Name":"Dana Kowalski","rating":"5/5","platform":"google","review_body":"AC died during the heat wave and Marcus was at our house within two hours. He showed me the burnt capacitor, explained the options without upselling, and had it running before dinner. Fair price too.","review url":"https://g.page/r/example-review"}
```
```json
{"user":"Sam T.","Stars Given":"1","site":"Yelp","txt":"booked a tune-up for 9am, nobody showed til almost noon and no one called. tech was nice but i took the morning off work for this"}
```
Expect: two draft emails, one text (for the 1-star), one new row in Testimonial Tuesday (for the 5-star).

## Customize
- **Voice:** `OWNER_VOICE`, plus the reply rules in the AI `instructions`
- **Alert threshold:** `isLow` (default 1 or 2 stars)
- **Testimonial rule:** `stars === 5` (lower it to 4 if you like)
- **Auto-post for Google:** Google Business Profile has a **Create Reply** action (`create_reply`, needs `review_name` from the trigger's `name`). Only add it behind a real approval step; this skill never posts unreviewed.

## Notes
- Nothing is ever posted publicly by this Zap. The owner approves every reply by posting it.
- SMS by Zapier texts only the verified owner number and truncates past 153 characters; the alert is kept under 150.
- Never commit a real webhook URL, email address, phone number, or sheet ID.
