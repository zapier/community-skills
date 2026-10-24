---
name: nexhello-business-card-to-notion
description: Build a Zapier Next Gen Zap that sends every business card scanned with NexHello into a Notion contacts database. A webhook catches the contact NexHello sends, the code skips the connection test and anything without a contact ID, Notion finds the row by NexHello Contact ID (or creates it), and the row is updated with name, company, job title, email, phone, LinkedIn, website, address, notes and the original card text. Use when someone scans business cards with NexHello and wants them in Notion without duplicates.
license: MIT
metadata:
  author: andrewckor
---

# NexHello Business Card to Notion

## What it does
1. **Trigger:** Webhooks by Zapier **Catch Hook** (`WebHookCLIAPI`, `hook_v2`). NexHello posts the contact you pick after a scan to this URL.
2. **Filter (code):** stops unless the event `type` is `contact.activity.recorded` and `data.contact.id` is set. NexHello's connection test (`webhook.test`, no contact) stops here, so it never creates a row.
3. **Notion Find Data Source Items** (`NotionCLIAPI`, `find_data_source_item`) in the NexHello Contacts data source, where **NexHello Contact ID** equals `data.contact.id`. If nothing matches, **Notion Create Data Source Item** (`create_database_item`) makes the row with the contact ID and first name.
4. **Notion Update Data Source Item** (`update_database_item`) on that row:

   | Notion property | From NexHello |
   | --- | --- |
   | First Name (title) | `data.contact.first_name` |
   | Last Name | `data.contact.last_name` |
   | Company | `data.contact.company` |
   | Job title | `data.contact.job_title` |
   | Primary email | `data.contact.email` (lowercased) |
   | Primary phone | `data.contact.phone` |
   | LinkedIn | `data.contact.linkedin` (gets `https://` if missing) |
   | Website | `data.contact.website` (gets `https://` if missing) |
   | Address | `data.contact.address` |
   | About this person | `data.contact.about_this_person` |
   | Original text type | `raw.payload_type` |
   | Original text | `raw.payload` (first 2,000 characters, Notion's limit) |

   Empty incoming fields are left out of the update, so existing Notion values stay.
5. Returns the contact ID, name, company, the Notion item ID, whether the row was created, and how many fields were written.

## Build it
1. Use Zapier MCP (the `zapier:build-workflows` skill, if available) to create a private Next Gen Zap from `workflow.ts` in this folder. Use the file as written, then set the constants at the top (see Ask the user).
2. Trigger: Webhooks by Zapier Catch Hook (`WebHookCLIAPI`, `hook_v2`), no authentication, no params.
3. Bind the connection `notion_contacts` to the user's Notion account. The NexHello Contacts database must be shared with that Notion connection, or it will not show up.
4. **Before the first run, check the Notion field keys.** Notion keys are `properties|||<Property name>|||<type>` and depend on the user's database. With the user's connection and data source, inspect `find_data_source_item` (with `search_fields: ["NexHello Contact ID"]` and the filter set to `equals`), `create_database_item` (with `template_mode: "none"`) and `update_database_item`, and confirm each key in `PROPS` and `CONTACT_ID_FILTER`. If a column has a different name or type (for example Primary email as text, so `rich_text` instead of `email`), change it in `PROPS`.
5. Publish, copy the webhook URL, and paste it into NexHello's webhook integration. Test with the steps below, then leave it on.

## Ask the user
- Which Notion database holds the contacts? (`NOTION_DATA_SOURCE_ID`; pick "NexHello Contacts" from the Notion dropdown once connected). If they don't have one, have them create it with the properties in the table above, plus a **NexHello Contact ID** text property, and share it with the Zapier Notion connection.
- Are any of the column names or types different from the table above?
- Do they want any field left out? Remove it from `fields` in the update step.

Note: the Webhooks by Zapier trigger needs a paid Zapier plan.

## Test
### Sample payload
```json
{"id":"evt_01JB7Q4ZK2","type":"contact.activity.recorded","created_at":"2026-10-23T14:12:09Z","data":{"activity":"card_scanned","contact":{"id":"ctc_8f3k2m9q","first_name":"Maya","last_name":"Lindqvist","company":"Northwind Robotics","job_title":"Head of Partnerships","email":"Maya.Lindqvist@northwind-robotics.example","phone":"+44 20 7946 0958","linkedin":"linkedin.com/in/maya-lindqvist-example","website":"northwind-robotics.example","address":"12 Harbour Street, Bristol BS1 4XX, UK","about_this_person":"Met at the Web Summit robotics meetup. Wants a demo of the fleet dashboard in November.","notes":""}},"raw":{"payload_type":"business_card","payload":"NORTHWIND ROBOTICS\nMaya Lindqvist\nHead of Partnerships\nmaya.lindqvist@northwind-robotics.example\n+44 20 7946 0958\nnorthwind-robotics.example\n12 Harbour Street, Bristol BS1 4XX"}}
```
NexHello's connection test looks like this and must not create anything:
```json
{"id":"evt_test_0001","type":"webhook.test","created_at":"2026-10-23T14:10:00Z","data":{}}
```

### Test with NexHello and Notion
Setup note: After creating the webhook trigger, copy its URL into NexHello's connection settings and send one saved test contact (not the connection test), so the trigger has sample data. Then map the filter (event type equals `contact.activity.recorded`, `data.contact.id` exists) and the Notion fields.

1. Connect Notion in Zapier, bind `notion_contacts`, set `NOTION_DATA_SOURCE_ID` and confirm the `PROPS` keys (Build it, step 4). A copy of the database (for example "NexHello Contacts test") is a safe place to start.
2. Run the workflow with the connection test payload. It should return `skipped` and run no Notion step.
3. Run it with the sample payload. Check:
   - `find-notion-contact` finds nothing, `create-notion-contact` creates the row, and `update-notion-contact` writes the fields.
   - The Notion row shows Maya Lindqvist, Northwind Robotics, the lowercased email, the LinkedIn and website as full `https://` links, and the card text in Original text.
4. Change the job title in the sample, blank out `about_this_person`, and run it again. The same row is updated (no second row, `created: false`), the job title changes, and About this person keeps its old value.
5. Paste the webhook URL into NexHello, send its connection test, then scan a real business card and send the contact. Confirm the test made no row and the card did.
6. Call it done when this run passes.

## Customize
- **Columns:** `PROPS` maps each field to a Notion property name and type. Add a property there and in `fields` to write more, or remove one to stop writing it.
- **Event:** `EVENT_TYPE` (default `contact.activity.recorded`).
- **Create step:** sets only the contact ID and first name, so the update step owns every other field. Add more there if you want the row complete even if the update step is turned off.
- **Card text:** `NOTION_TEXT_LIMIT` trims the original text to fit one Notion text property.

## Notes
- The match key is NexHello's contact ID, so a person scanned twice stays one row, even if their name or email changes.
- If the payload arrives as a JSON string or wrapped in `body`, the code unwraps it.
- Never commit real webhook URLs, Notion ids, contact data or connection ids.
