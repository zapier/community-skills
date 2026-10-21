import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

// Who the reminder comes from, and how it should sound. Ask the user.
const OWNER_NAME = "Sam"; // signs the reminder email
const BUSINESS_NAME = "Your Business"; // Gmail "from" name
const OWNER_VOICE =
  "Friendly, plain-spoken small business owner. First person. Short sentences. Assumes good faith, never guilt-trips. No corporate phrases.";

// Timing, counted from the invoice due date.
const REMIND_AFTER_DAYS = 3; // email the customer this many days after the due date
const ESCALATE_AFTER_DAYS = 7; // text the owner if it's still unpaid this many days after the due date
const DAY = 86400;

// Optional, webhook path only: a URL that returns the invoice's current status as JSON
// (e.g. {"balance": 0} or {"status": "paid"}). "{invoice}" is replaced with the invoice id or number.
// Leave empty to use the status the webhook sent (or send status_url in the payload).
const STATUS_CHECK_URL = "";

// Trigger: QuickBooks Online "New Invoice" (QuickBooksV3CLIAPI invoice_v2, connection alias quickbooks),
// or Webhooks by Zapier Catch Hook (WebHookCLIAPI hook_v2) for any other billing tool.
// Both payload shapes are handled below. Optional test inputs: remind_wait_seconds, escalate_wait_seconds.

type Flat = Record<string, unknown>;

function normalizeInput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { note: raw };
    }
  }
  return (raw ?? {}) as Record<string, unknown>;
}

// Flatten nested keys (CustomerRef.name -> customerrefname) so QuickBooks and messy webhook fields match the same rules.
function flatten(obj: unknown, prefix = "", out: Flat = {}): Flat {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix + k.toLowerCase().replace(/[^a-z0-9]/g, ""), out);
    }
  } else if (prefix) {
    out[prefix] = obj;
  }
  return out;
}

function pick(flat: Flat, patterns: RegExp[], valueOk: (v: unknown) => boolean = (v) => v !== null && v !== undefined && String(v).trim() !== "") {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(flat)) {
      if (re.test(k) && valueOk(v)) return v;
    }
  }
  return undefined;
}

const EMAIL_RE = /[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i;
const toMoney = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && String(v ?? "").match(/\d/) ? n : undefined;
};
const isDate = (v: unknown) => typeof v === "string" && /\d/.test(v) && !Number.isNaN(Date.parse(v));

function readInvoice(payload: Record<string, unknown>) {
  const flat = flatten(payload);
  const isQuickBooks = "SyncToken" in payload || "CustomerRef" in payload || "DocNumber" in payload;
  const email = String(
    pick(flat, [/billemailaddress/, /customeremail|clientemail|billingemail|emailaddress|email|mail/], (v) => EMAIL_RE.test(String(v ?? ""))) ?? "",
  ).match(EMAIL_RE)?.[0];
  const balance = toMoney(pick(flat, [/^balance$|balancedue|amountdue|amtdue|dueamount|dueamt|owed|outstanding/], (v) => toMoney(v) !== undefined));
  const total = toMoney(pick(flat, [/totalamt|^total|amount|^amt|price|sum/], (v) => toMoney(v) !== undefined));
  const statusText = String(pick(flat, [/status|state|paid/]) ?? "").toLowerCase();
  const name = String(pick(flat, [/customerrefname|customername|clientname|customer$|client$|billtoname|billto$|contactname|^name$|fullname/]) ?? "");
  return {
    isQuickBooks,
    invoiceId: String(pick(flat, [/^id$|invoiceid|^txnid/]) ?? ""),
    number: String(pick(flat, [/docnumber|invoicenumber|invoiceno|invoicenum|^invno|^inv$|^invoice$|^number$|^no$/]) ?? "").replace(/^#/, ""),
    customerName: name.trim() || "there",
    email,
    amount: balance ?? total,
    currency: String(pick(flat, [/currencyrefvalue|^currency$/]) ?? "USD").toUpperCase(),
    dueDate: pick(flat, [/^duedate$|duedate|dueon|dueby|^due$|paymentdue/], isDate) as string | undefined,
    payLink: pick(flat, [/invoicelink|paylink|paymentlink|payurl|paymenturl|checkout|^pay/, /^(?!.*(status|check)).*(link|url)$/], (v) => /^https?:\/\//i.test(String(v ?? ""))) as string | undefined,
    paid: balance === 0 || (/paid|closed|settled/.test(statusText) && !/unpaid|not ?paid|partial|overdue/.test(statusText)) || statusText === "true",
    statusUrl: (pick(flat, [/statusurl|checkurl/], (v) => /^https?:\/\//i.test(String(v ?? ""))) as string | undefined) ?? "",
  };
}

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || "A customer";
};
const formatMoney = (n: number | undefined, currency: string) => {
  if (n === undefined) return "the balance";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n).replace(/\.00$/, "");
  } catch {
    return `${n} ${currency}`;
  }
};
const formatDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
const secondsUntil = (iso: string | undefined, days: number, nowMs: number) =>
  iso ? Math.round((Date.parse(iso) + days * DAY * 1000 - nowMs) / 1000) : days * DAY;
const toSeconds = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

const workflow = defineDurable<unknown, unknown>(
  "unpaid-invoice-nudge",
  async (ctx, rawInput) => {
    const payload = normalizeInput(rawInput);
    const invoice = readInvoice(payload);
    const label = invoice.number ? `#${invoice.number}` : "your invoice";
    const amountText = formatMoney(invoice.amount, invoice.currency);
    const who = shortName(invoice.customerName === "there" ? "" : invoice.customerName);

    // Re-check the invoice: QuickBooks Find Invoice on the QuickBooks path, else the optional status URL, else the webhook's own status.
    const checkStillUnpaid = async (stepName: string) => {
      if (invoice.isQuickBooks) {
        const found = await ctx.step(stepName, async () =>
          sdk.runAction({
            appKey: "QuickBooksV3CLIAPI",
            actionType: "search",
            actionKey: "invoice",
            connection: "quickbooks",
            inputs: invoice.invoiceId ? { invoiceId: invoice.invoiceId } : { number: invoice.number },
          }),
        );
        const record = (found.data?.[0] ?? {}) as Record<string, unknown>;
        const balance = toMoney(record.Balance ?? record.balance);
        return balance === undefined ? !invoice.paid : balance > 0;
      }
      const status = await ctx.step(stepName, async () => {
        const url = (invoice.statusUrl || STATUS_CHECK_URL).replace("{invoice}", encodeURIComponent(invoice.invoiceId || invoice.number));
        if (!url) return { source: "webhook payload", paid: invoice.paid };
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status check returned ${response.status}`);
        const latest = readInvoice(normalizeInput(await response.json()));
        return { source: "status url", paid: latest.paid };
      });
      return !status.paid;
    };

    // Wait until REMIND_AFTER_DAYS past the due date (or remind_wait_seconds, for tests).
    const startedAt = await ctx.step("capture-start-time", async () => Date.now());
    const remindWait =
      toSeconds(payload.remind_wait_seconds) ?? Math.max(1, secondsUntil(invoice.dueDate, REMIND_AFTER_DAYS, startedAt));
    await ctx.wait("wait-until-reminder-day", remindWait);

    if (!(await checkStillUnpaid("check-invoice-before-reminder"))) {
      return { invoice: label, stopped: "paid before reminder", emailed: false, texted: false };
    }
    if (!invoice.email) {
      return { invoice: label, stopped: "no customer email on the invoice", emailed: false, texted: false };
    }

    const drafted = await ctx.step("draft-payment-reminder", async () =>
      sdk.runAction({
        appKey: "AICLIAPI",
        actionType: "write",
        actionKey: "get_completion",
        inputs: {
          authentication_id: "0",
          model_id: "standard/auto",
          includeWorkflowData: "false",
          instructions:
            "Write a short, polite payment reminder email from a small business owner to a customer whose invoice is a few days overdue. " +
            "Voice: " + OWNER_VOICE + " " +
            "Use the customer's first name. Mention the invoice number, the amount and the due date exactly as given. " +
            "If a pay link is given, include it on its own line. If not, say they can reply to this email for payment options. " +
            "Assume it slipped through the cracks. 3 to 5 short sentences, under 90 words. Sign off with the owner's name. " +
            "No emojis, no em dashes, no threats, no late fees unless given. Never invent a link, amount or date. " +
            "Also write a subject line under 60 characters that includes the invoice number.",
          inputFields: {
            customer_name: invoice.customerName,
            invoice_number: label,
            amount: amountText,
            due_date: formatDate(invoice.dueDate) || "recently",
            pay_link: invoice.payLink ?? "",
            owner_name: OWNER_NAME,
          },
          outputSchema: {
            subject: "Email subject under 60 chars with the invoice number",
            body: "Plain-text reminder email body, under 90 words, signed by the owner",
          },
        },
      }),
    );
    const draft = (drafted.data?.[0] ?? {}) as Record<string, string>;
    const subject = draft.subject || `Quick reminder: invoice ${label}`;
    const body = draft.body || `Hi, a quick reminder that invoice ${label} for ${amountText} is past due.${invoice.payLink ? `\n\nPay here: ${invoice.payLink}` : ""}\n\nThanks,\n${OWNER_NAME}`;

    const email = await ctx.step("email-customer-reminder", async () =>
      sdk.runAction({
        appKey: "GoogleMailV2CLIAPI",
        actionType: "write",
        actionKey: "message",
        connection: "gmail_owner",
        inputs: { to: [invoice.email], subject, body, body_type: "plain", from_name: BUSINESS_NAME },
      }),
    );

    // Wait until ESCALATE_AFTER_DAYS past the due date (4 more days by default, or escalate_wait_seconds for tests).
    const escalateWait =
      toSeconds(payload.escalate_wait_seconds) ?? (ESCALATE_AFTER_DAYS - REMIND_AFTER_DAYS) * DAY;
    await ctx.wait("wait-until-escalation-day", escalateWait);

    if (!(await checkStillUnpaid("check-invoice-before-owner-text"))) {
      return { invoice: label, stopped: "paid after reminder", emailed: Boolean(email.data?.[0]), texted: false };
    }

    const checkedAt = await ctx.step("capture-escalation-time", async () => Date.now());
    const daysLate = invoice.dueDate
      ? Math.max(1, Math.floor((checkedAt - Date.parse(invoice.dueDate)) / (DAY * 1000)))
      : ESCALATE_AFTER_DAYS;
    const message = `${who} still owes ${amountText} on ${label}, ${daysLate} day${daysLate === 1 ? "" : "s"} late.`.slice(0, 150);

    const sms = await ctx.step("text-owner-still-unpaid", async () =>
      sdk.runAction({
        appKey: "SMSCLIAPI",
        actionType: "write",
        actionKey: "send_v2",
        connection: "sms_owner",
        inputs: { message },
      }),
    );

    return { invoice: label, customer: who, amount: amountText, subject, emailed: Boolean(email.data?.[0]), texted: Boolean(sms.data?.[0]), message };
  },
);

export default workflow;
