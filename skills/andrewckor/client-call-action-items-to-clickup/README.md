# Client call action items to ClickUp

Every promise made on a client call becomes an assigned, dated ClickUp task. Fathom catches the action item, AI works out who owns it, when it's due and which client it's for, ClickUp gets the task, and the owner gets a Slack DM with the link. At 5pm, everyone gets a digest of their open call items.

Built as a Zapier Next Gen Zap. Inspired by [this post](https://x.com/jordan_ross_8F/status/2111219700499910987).

## Use it
Paste into Claude, ChatGPT, or Cursor with Zapier MCP connected:

> Build me the Next Gen Zap described in github.com/zapier/community-skills/tree/main/skills/andrewckor/client-call-action-items-to-clickup using Zapier MCP.

Coding agents can also run `npx skills add zapier/community-skills --skill client-call-action-items-to-clickup`.

## Files
- `SKILL.md` tells your AI how to build, set up and test it
- `workflow.ts` is the Next Gen Zap code
