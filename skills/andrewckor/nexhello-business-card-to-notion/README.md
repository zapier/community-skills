# NexHello Business Card to Notion

Scan a business card with NexHello and the contact lands in your Notion contacts database: name, company, job title, email, phone, LinkedIn, website, address, notes and the original card text. Scan the same person again and the same Notion row is updated, never duplicated. Empty fields never wipe what is already there, and NexHello's connection test is ignored.

Built as a Zapier Next Gen Zap. Inspired by [Enrico Simonetti's NexHello guide, Business card to Notion with Zapier](https://www.nexhello.com/integrations/business-card-to-notion-with-zapier/).

## Use it
Paste into Claude, ChatGPT, or Cursor with Zapier MCP connected:

> Build me the Next Gen Zap described in github.com/zapier/community-skills/tree/main/skills/andrewckor/nexhello-business-card-to-notion using Zapier MCP.

Coding agents can also run `npx skills add zapier/community-skills --skill nexhello-business-card-to-notion`.

## Set it up
1. Create the webhook trigger (Webhooks by Zapier, Catch Hook).
2. After creating the webhook trigger, copy its URL into NexHello's connection settings and send one saved test contact (not the connection test), so the trigger has sample data.
3. Map the filter (event type equals `contact.activity.recorded`, `data.contact.id` exists) and the Notion fields.

## Files
- `SKILL.md`: what the Zap does, how to build it, what to ask, how to test it
- `workflow.ts`: the Next Gen Zap code
