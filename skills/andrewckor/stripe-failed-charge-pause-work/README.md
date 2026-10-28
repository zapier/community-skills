# Stripe Failed Charge Pause Work

A client's card fails and you keep working for free. This Zap stops that. When Stripe reports a failed payment, AI writes a friendly card-update email in your voice and Gmail sends it to the client. Your team gets a Slack alert to pause work on that client. It waits 48 hours, checks the invoice in Stripe again, and if it is still unpaid it texts you.

Built as a Zapier Next Gen Zap. Inspired by [this post](https://x.com/elliotkovac28/status/2114035989886672905).

## Use it
Paste into Claude, ChatGPT, or Cursor with Zapier MCP connected:

> Build me the Next Gen Zap described in github.com/zapier/community-skills/tree/main/skills/andrewckor/stripe-failed-charge-pause-work using Zapier MCP.

Coding agents can also run `npx skills add zapier/community-skills --skill stripe-failed-charge-pause-work`.

## Files
- `SKILL.md` tells your AI how to build, set up and test it
- `workflow.ts` is the Next Gen Zap code
