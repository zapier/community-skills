import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

// Where contacts go in Notion. Ask the user (pick the data source from the Notion dropdown once connected).
const NOTION_DATA_SOURCE_ID = "NOTION_DATA_SOURCE_ID"; // the "NexHello Contacts" data source

// Notion field keys are "properties|||<Property name>|||<property type>".
// These match the NexHello Contacts template. If a column in the user's database has a
// different name or type (for example Primary email as plain text), change it here.
const PROPS = {
  contactId: "properties|||NexHello Contact ID|||rich_text",
  firstName: "properties|||First Name|||title",
  lastName: "properties|||Last Name|||rich_text",
  company: "properties|||Company|||rich_text",
  jobTitle: "properties|||Job title|||rich_text",
  email: "properties|||Primary email|||email",
  phone: "properties|||Primary phone|||phone_number",
  linkedin: "properties|||LinkedIn|||url",
  website: "properties|||Website|||url",
  about: "properties|||About this person|||rich_text",
  address: "properties|||Address|||rich_text",
  originalTextType: "properties|||Original text type|||rich_text",
  originalText: "properties|||Original text|||rich_text",
} as const;
const CONTACT_ID_FILTER = "properties|||NexHello Contact ID|||filter";

const EVENT_TYPE = "contact.activity.recorded"; // anything else (like the "webhook.test" connection check) is skipped
const NOTION_TEXT_LIMIT = 2000; // Notion's limit per text property

// Trigger: Webhooks by Zapier "Catch Hook" (WebHookCLIAPI hook_v2). Paste its URL into NexHello as the webhook.
// Connection alias: notion_contacts (the Notion account that can see the NexHello Contacts database).

type Obj = Record<string, unknown>;

function normalizeInput(raw: unknown): Obj {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return (raw ?? {}) as Obj;
}

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// Some webhook catchers hand nested JSON over as a string, or wrap it in "body". Unwrap both.
function unwrap(payload: Obj): Obj {
  if (typeof payload.body === "string") {
    try {
      return unwrap(JSON.parse(payload.body));
    } catch {
      /* not JSON */
    }
  }
  if (payload.body && typeof payload.body === "object" && !payload.type && !payload.event) return unwrap(obj(payload.body));
  for (const k of ["data", "raw"]) {
    if (typeof payload[k] === "string") {
      try {
        payload[k] = JSON.parse(payload[k] as string);
      } catch {
        /* leave as is */
      }
    }
  }
  return payload;
}

function asUrl(v: string) {
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

function readContact(payload: Obj) {
  const data = obj(payload.data);
  const c = obj(data.contact);
  const raw = obj(payload.raw ?? data.raw);
  return {
    id: text(c.id),
    firstName: text(c.first_name),
    lastName: text(c.last_name),
    company: text(c.company),
    jobTitle: text(c.job_title),
    email: text(c.email).toLowerCase(),
    phone: text(c.phone),
    linkedin: asUrl(text(c.linkedin)),
    website: asUrl(text(c.website)),
    address: text(c.address),
    about: text(c.about_this_person),
    originalTextType: text(raw.payload_type),
    originalText: text(raw.payload).slice(0, NOTION_TEXT_LIMIT),
  };
}

const workflow = defineDurable<unknown, unknown>(
  "nexhello-business-card-to-notion",
  async (ctx, rawInput) => {
    const payload = unwrap(normalizeInput(rawInput));
    const eventType = text(payload.type ?? payload.event ?? payload.event_type);

    // Filter: only real contact events with a contact ID. The NexHello connection test is "webhook.test".
    if (eventType !== EVENT_TYPE) return { skipped: `event type "${eventType || "none"}" is not ${EVENT_TYPE}` };
    const contact = readContact(payload);
    if (!contact.id) return { skipped: "no contact id in the payload" };

    // Notion: find the item whose NexHello Contact ID equals this contact's id.
    const found = await ctx.step("find-notion-contact", async () =>
      sdk.runAction({
        appKey: "NotionCLIAPI",
        actionType: "search",
        actionKey: "find_data_source_item",
        connection: "notion_contacts",
        inputs: {
          datasource: NOTION_DATA_SOURCE_ID,
          search_fields: ["NexHello Contact ID"],
          [CONTACT_ID_FILTER]: "equals",
          [PROPS.contactId]: contact.id,
        },
      }),
    );
    let itemId = text((found.data?.[0] as Obj | undefined)?.id);
    let created = false;

    // ...or create it, with just the id and a name, so the update below fills the rest.
    if (!itemId) {
      const made = await ctx.step("create-notion-contact", async () =>
        sdk.runAction({
          appKey: "NotionCLIAPI",
          actionType: "write",
          actionKey: "create_database_item",
          connection: "notion_contacts",
          inputs: {
            datasource: NOTION_DATA_SOURCE_ID,
            template_mode: "none",
            [PROPS.contactId]: contact.id,
            [PROPS.firstName]: contact.firstName || contact.email || "New contact",
          },
        }),
      );
      itemId = text((made.data?.[0] as Obj | undefined)?.id);
      created = true;
    }
    if (!itemId) throw new Error("Notion did not return an item id for this contact");

    // Notion: update the item. Empty incoming fields are left out, so existing values stay.
    const fields: Obj = {
      [PROPS.firstName]: contact.firstName,
      [PROPS.lastName]: contact.lastName,
      [PROPS.company]: contact.company,
      [PROPS.jobTitle]: contact.jobTitle,
      [PROPS.email]: contact.email,
      [PROPS.phone]: contact.phone,
      [PROPS.linkedin]: contact.linkedin,
      [PROPS.website]: contact.website,
      [PROPS.about]: contact.about,
      [PROPS.address]: contact.address,
      [PROPS.originalTextType]: contact.originalTextType,
      [PROPS.originalText]: contact.originalText,
    };
    const inputs: Obj = { datasource: NOTION_DATA_SOURCE_ID, page: itemId };
    for (const [k, v] of Object.entries(fields)) if (text(v)) inputs[k] = v;

    await ctx.step("update-notion-contact", async () =>
      sdk.runAction({
        appKey: "NotionCLIAPI",
        actionType: "write",
        actionKey: "update_database_item",
        connection: "notion_contacts",
        inputs,
      }),
    );

    return {
      contactId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      company: contact.company,
      notionItemId: itemId,
      created,
      fieldsUpdated: Object.keys(inputs).length - 2,
    };
  },
);

export default workflow;
