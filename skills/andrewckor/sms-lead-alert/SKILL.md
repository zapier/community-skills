---
name: sms-lead-alert
description: Build a Zapier Next Gen Zap that texts the business owner every new lead (name, phone, need, and a suggested reply). Use when someone wants instant lead alerts by SMS from a website form, webhook, or Facebook Lead Ads.
license: MIT
metadata:
  author: andrewckor
---

# SMS lead alert

## What it does
1. **Trigger:** a new lead arrives at a Webhooks by Zapier catch hook (any website form can post to it). Facebook Lead Ads "New Lead" can be added as a second trigger.
2. **AI by Zapier** reads the raw submission, even with odd field names, and returns `name`, `phone`, `need` (under 45 characters, with city and timing) and `reply` (a friendly text under 60 characters using the lead's first name).
3. **SMS by Zapier** texts the owner:
   ```
   Maria Lopez
   (201) 555-0148

   Leaking water heater, Union City, today

   Reply: "Hi Maria, I can come by this afternoon. Does 3pm work?"
   ```

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a Next Gen Zap from `workflow.ts` in this folder. Use the file as written.
2. Trigger: Webhooks by Zapier, Catch Hook (`WebHookCLIAPI`, `hook_v2`).
3. Connection: bind `sms_owner` to the user's SMS by Zapier connection. Ask the user to connect it if they haven't.
4. Deploy it, then give the user their webhook URL and tell them to point their form at it.

## Ask the user
- Which phone number should get the alerts? (Set it in the SMS by Zapier connection, not in the code.)
- Where do leads come from: a website form, Facebook Lead Ads, or both?

## Test
POST a sample lead to the webhook:
```json
{"full_name":"Maria Lopez","tel":"(201) 555-0148","msg":"Water heater leaking, Union City, can someone come today?"}
```
Confirm the text arrives within about a minute.

## Customize
- **Message format:** the `message` template in `workflow.ts`
- **Reply tone or length:** the AI `instructions`
- **Lead sources:** add triggers such as Facebook Lead Ads

## Notes
- SMS by Zapier texts only the verified owner number. It sends alerts to you, not texts to the lead.
- Never commit a real webhook URL or phone number. Anyone who has the URL can trigger texts.
