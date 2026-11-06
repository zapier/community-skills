---
name: client-call-action-items-to-clickup
description: Build a Zapier Next Gen Zap that turns every action item from a recorded client call (Fathom) into an assigned, dated ClickUp task. AI by Zapier works out the owner, the due date ("by Thursday" becomes a real date) and the client, ClickUp gets the task, and Slack DMs the owner the task link. A 5pm digest DMs each owner their open call tasks. Use when an agency or service team keeps losing the things they promised on client calls.
license: MIT
metadata:
  author: andrewckor
---

# Client call action items to ClickUp

## What it does
1. **Trigger:** Fathom **New Action Item** (`FathomCLIAPI`, `actionitem`). Fires for each action item Fathom pulls from a recorded call.
2. **AI by Zapier** reads the item, the meeting title, meeting date and attendees, and returns:
   - `owner_name`: who on the team has to do it
   - `due_date`: what was said ("by end of day Thursday") resolved to `YYYY-MM-DD`. Empty if no timing was said; the code then uses `DEFAULT_DUE_DAYS` business days.
   - `client`: the client company
   - `task_title`: a clear title that starts with a verb
3. **Owner lookup:** `OWNER_MAP` in the code maps the owner to their ClickUp assignee email and Slack member ID. Unknown owners go to `DEFAULT_OWNER`.
4. **ClickUp Create Task** (`ClickUpCLIAPI`, `task`) in your list: title `Client: task`, assignee, due date, the `client-call` tag, and a description with what was said, the timestamp and the recording link.
5. **Slack** DMs the owner, e.g. (from a real test run):
   ```
   New action item from your call with Acme Dental: Send revised Q4 ad budget with two new location campaigns broken out
   Due Thu, Oct 22
   https://app.clickup.com/t/<task id>
   ```
6. **5pm digest:** the same code, published a second time on **Schedule by Zapier, Every Day at 5:00 PM**, lists the open `client-call` tasks in your ClickUp list (ClickUp API `GET /list/{id}/task`, through the ClickUp app's API request action `_zap_raw_request`) and DMs each owner theirs, overdue ones marked:
   ```
   Open client call action items (2):
   - Acme Dental: Send revised Q4 ad budget | due Wed, Oct 21 (overdue) | https://app.clickup.com/t/...
   - Acme Dental: Share landing page draft | due Sat, Oct 24 | https://app.clickup.com/t/...
   ```
   Any run whose input has schedule fields (`pretty_date`, `day_of_week`, ...) or `{"digest": true}` takes the digest path.

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a private Next Gen Zap from `workflow.ts` in this folder. Use the file as written, then set the constants at the top (see Ask the user).
2. **Workflow 1, action items:** trigger Fathom New Action Item (`FathomCLIAPI`, `actionitem`) with the user's Fathom connection as the trigger's authentication.
3. **Workflow 2, digest:** a second Next Gen Zap from the same `workflow.ts` with a Schedule by Zapier trigger set to Every Day at 5:00 PM in the user's time zone. Look up the exact trigger key with Zapier MCP; don't guess it. Skip it if the user doesn't want a digest.
4. Bind connections (both workflows):
   - `clickup`: the user's ClickUp account
   - `slack`: the Slack account that sends the DMs
   - AI by Zapier needs no connection (managed `authentication_id: "0"`).
5. **Before the first run, check the ClickUp field keys.** Create Task's space, folder, list, assignee, due date and tag fields are dynamic. List the `task` action's input fields with the user's ClickUp connection and confirm the keys in the `create-clickup-task` step (`team_id`, `space_id`, `folder_id`, `list_id`, `name`, `content`, `markdown`, `assignees`, `due_date`, `tags`). Rename any that differ.
6. Test with the steps below, then turn both workflows on.

## Ask the user
- Which ClickUp workspace, space, folder and list should call tasks land in? (`CLICKUP_WORKSPACE_ID`, `CLICKUP_SPACE_ID`, `CLICKUP_FOLDER_ID`, `CLICKUP_LIST_ID`; pick from the ClickUp dropdowns once connected)
- Who is on the team? For each person: their first name as it shows in Fathom, their ClickUp email and their Slack member ID (Slack profile, ⋮, Copy member ID). This fills `OWNER_MAP`.
- Who gets items with no clear owner? (`DEFAULT_OWNER`)
- No date said on the call: how many business days by default? (`DEFAULT_DUE_DAYS`, default 2)
- Do you want the 5pm digest, and in which time zone?

## Test
### Sample payload
```json
{"Action Item":{"Description":"Andrew to send Acme Dental the revised Q4 ad budget with the two new location campaigns broken out, by end of day Thursday","assignee":{"Name":"Andrew K.","e-mail":""},"completed":false,"recording_playback_time":"00:23:41"},"Recording":{"Meeting Title":"Acme Dental x Agency - Monthly Growth Review","recording_start_time":"2026-10-20T15:00:00Z","share_url":"https://fathom.video/share/sample-recording-123"},"calendar_invitees":[{"name":"Dana Ruiz","email":"dana@acmedental.example"},{"name":"Andrew K.","email":"andrew@test.example"}]}
```
Put the user's own first name in `Description` and `assignee` and add them to `OWNER_MAP`, so the DM goes to them.

### Test with Fathom and ClickUp
1. Connect Fathom and ClickUp in Zapier. Bind `clickup` and `slack`, and set the Fathom trigger's authentication.
2. Make a throwaway ClickUp list (for example "Call tasks test") and point `CLICKUP_*` at it. Put the tester in `OWNER_MAP`.
3. Record a short Fathom call where you say an action item out loud with an owner and a deadline ("Sam to send the proposal by Friday"). Wait for Fathom to finish its summary.
4. Pull it with the trigger's test / find new records, and run the workflow on that record.
5. Check each step:
   - The code reads Fathom's real field names: action item text, assignee, meeting title, meeting date, share link. If any come back empty, add the real key to the patterns in `readActionItem`.
   - `extract-owner-due-client` returns the owner, the Friday date, the client and a title.
   - `create-clickup-task` creates a task in the test list with the right assignee, due date and `client-call` tag. The DM link opens it.
   - `dm-owner-task-link` lands in the owner's Slack DMs.
6. Run the digest once with `{"digest": true}` and confirm it lists that task. Then close the task in ClickUp, run it again and confirm it is gone.
7. Call it done when this run passes.

## Customize
- **Owners:** `OWNER_MAP` and `DEFAULT_OWNER`. To keep the team list out of the code, use a Zapier Tables table (first name, ClickUp email, Slack ID) and a Tables Find Record step in place of `findOwner`.
- **Default due date:** `DEFAULT_DUE_DAYS` (business days). Tasks are due at 5:00 PM.
- **Tag:** `CLICKUP_TAG` (default `client-call`). The digest only lists tasks with this tag.
- **Titles and extraction rules:** the AI `instructions`.
- **One list per client:** map `client` to a list id and pass it as `list_id`.

## Notes
- One task per Fathom action item. If Fathom sends the same item twice, you get two tasks; search ClickUp by name first (`findTaskArray`) to skip duplicates.
- The AI never invents a deadline. No date said means the default, and the DM says so.
- Never commit real Slack member IDs, emails, ClickUp ids or webhook URLs.
