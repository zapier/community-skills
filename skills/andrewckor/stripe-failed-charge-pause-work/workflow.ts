import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

// Ask the user for these. Everything else works as written.
const SLACK_CHANNEL_ID = "SLACK_CHANNEL_ID"; // the team channel that gets the "pause work" alert (channel ID, not name)
const BUSINESS_NAME = "Your Agency"; // Gmail "from" name on the card-update email
const OWNER_NAME = "Sam"; // signs the email
const OWNER_VOICE =
  "Friendly, plain-spoken agency owner. First person. Short sentences. Assumes the card just expired or hit a limit, never guilt-trips. No corporate phrases.";
const WAIT_HOURS = 48; // how long to wait before checking whether the client paid

// Trigger: Stripe "Invoice Payment Failed" (StripeCLIAPI, invoice_payment_failed, connection set on the trigger).
// Paying by one-off charge instead of invoices? Use the Stripe "Failed Payment" trigger (failed_payment); the same reader handles its payload.
// Connection aliases: stripe, gmail_owner, slack_team, sms_owner. AI by Zapier uses its managed authentication_id "0".
// Optional test input: wait_seconds (replaces the 48 hour wait).

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

// Flatten nested keys (customer.email -> customeremail) so Stripe invoices, PaymentIntents and messy webhook fields match the same rules.
function flatten(obj: unknown, prefix = "", out: Flat = {}): Flat {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix + k.toLowerCase().replace(/[^a-z0-9]/g, ""), out);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, prefix + i, out));
  } else if (prefix) {
    out[prefix] = obj;
  }
  return out;
}

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
function pick(flat: Flat, patterns: RegExp[], ok: (v: unknown) => boolean = filled): string {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(flat)) {
      if (re.test(k) && ok(v)) return String(v).trim();
    }
  }
  return "";
}
const EMAIL_RE = /[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i;
const isEmail = (v: unknown) => EMAIL_RE.test(String(v ?? ""));
const isUrl = (v: unknown) => /^https?:\/\//i.test(String(v ?? ""));
const isInvoiceId = (v: unknown) => /^in_[A-Za-z0-9_]+$/.test(String(v ?? ""));

function readFailure(payload: Record<string, unknown>) {
  const flat = flatten(payload);
  const email = (pick(flat, [/^customeremail$|^customer.*email$/, /billingdetailsemail$|receiptemail$/, /e?mail$/], isEmail).match(EMAIL_RE)?.[0] ?? "").toLowerCase();
  const name = pick(flat, [/^customername$|^customer.*name$/, /billingdetailsname$|invoicedatacustomername$/, /^name$|fullname$/]);
  const currency = (pick(flat, [/^currency$|invoicedatacurrency$/]) || "usd").toUpperCase();
  // Prefer Stripe's own formatted amount ("$1,200.00"). Else Stripe sends whole cents; a decimal point means dollars.
  const formatted = pick(flat, [/^amountremainingformatted$|^amountdueformatted$|^amountformatted$/]);
  const cents = pick(flat, [/^amountremaining$|^amountdue$|invoicedataamountdue$|^amount$/], (v) => filled(v) && !isNaN(Number(v)));
  const amountNumber = cents ? (cents.includes(".") ? Number(cents) : Number(cents) / 100) : undefined;
  const invoiceId = pick(flat, [/^id$/, /^invoice$|^invoiceid$|^invoicedataid$/], isInvoiceId);
  return {
    email,
    name: name || "",
    invoiceId,
    number: pick(flat, [/^number$|^invoicedatanumber$/]),
    amountText: formatted || (amountNumber === undefined ? "the balance" : formatMoney(amountNumber, currency)),
    payLink: pick(flat, [/hostedinvoiceurl$/], isUrl),
    reason: pick(flat, [/lastpaymenterrormessage$|failuremessage$/]),
    statusAtFailure: pick(flat, [/^status$/]).toLowerCase(),
  };
}

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}
const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || "A client";
};
const toSeconds = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

const workflow = defineDurable<unknown, unknown>(
  "stripe-failed-charge-pause-work",
  async (ctx, rawInput) => {
    const payload = normalizeInput(rawInput);
    const f = readFailure(payload);
    const label = f.number ? `#${f.number}` : f.invoiceId || "your latest invoice";
    const who = shortName(f.name);
    const firstName = f.name.trim().split(/\s+/)[0] || "there";

    // 1. AI writes a friendly card-update email.
    const drafted = await ctx.step("draft-card-update-email", async () =>
      sdk.runAction({
        appKey: "AICLIAPI",
        actionType: "write",
        actionKey: "get_completion",
        inputs: {
          authentication_id: "0",
          model_id: "standard/auto",
          includeWorkflowData: "false",
          instructions:
            "Write a short, friendly email from an agency owner to a client whose card payment just failed. " +
            "Voice: " + OWNER_VOICE + " " +
            "Use the client's first name. Mention the invoice number and the amount exactly as given. " +
            "Ask them to update their card. If a payment link is given, put it on its own line. If not, say they can reply to this email and you will send one. " +
            "If a failure reason is given, mention it in plain words. If not, do not guess a reason. " +
            "Assume it is an expired card or a bank block. 3 to 5 short sentences, under 90 words. Sign off with the owner's name. " +
            "No emojis, no em dashes, no threats, no mention of pausing work, no late fees. Never invent a link, amount or date. " +
            "Also write a subject line under 60 characters that includes the invoice number.",
          inputFields: {
            client_first_name: firstName,
            invoice_number: label,
            amount: f.amountText,
            payment_link: f.payLink,
            failure_reason: f.reason,
            owner_name: OWNER_NAME,
          },
          outputSchema: {
            subject: "Email subject under 60 chars with the invoice number",
            body: "Plain-text email body, under 90 words, signed by the owner",
          },
        },
      }),
    );
    const draft = (drafted.data?.[0] ?? {}) as Record<string, string>;
    const subject = draft.subject || `Your card didn't go through (${label})`;
    const body =
      draft.body ||
      `Hi ${firstName}, your card payment of ${f.amountText} for ${label} didn't go through.${f.payLink ? `\n\nYou can update your card here: ${f.payLink}` : "\n\nReply to this email and I will send you a link to update your card."}\n\nThanks,\n${OWNER_NAME}`;

    // 2. Send it from the owner's Gmail (skipped when Stripe has no client email).
    const email = f.email
      ? await ctx.step("email-client-card-update", async () =>
          sdk.runAction({
            appKey: "GoogleMailV2CLIAPI",
            actionType: "write",
            actionKey: "message",
            connection: "gmail_owner",
            inputs: { to: [f.email], subject, body, body_type: "plain", from_name: BUSINESS_NAME },
          }),
        )
      : undefined;
    const emailed = Boolean(email?.data?.[0]);

    // 3. Tell the team to pause work on this client.
    const waitSeconds = toSeconds(payload.wait_seconds) ?? WAIT_HOURS * 3600;
    const alert =
      `*Pause work: ${who}*\n` +
      `Card payment of ${f.amountText} failed on ${label}.\n` +
      `${emailed ? "Card-update email sent." : "No client email on the invoice, so nothing was sent."} ` +
      `I will check again in ${toHoursText(waitSeconds)} and text the owner if it is still unpaid.` +
      (f.payLink ? `\nInvoice: ${f.payLink}` : "");
    await ctx.step("alert-team-to-pause-work", async () =>
      sdk.runAction({
        appKey: "SlackCLIAPI",
        actionType: "write",
        actionKey: "channel_message",
        connection: "slack_team",
        inputs: { channel: SLACK_CHANNEL_ID, text: alert, as_bot: "true", unfurl: "false", add_edit_link: "false" },
      }),
    );

    // 4. Wait, then look at the invoice in Stripe again.
    await ctx.wait("wait-before-recheck", waitSeconds);

    const latest = await ctx.step("recheck-stripe-invoice", async () => {
      if (!f.invoiceId) return { found: false, resolved: false, status: "" };
      try {
        const found = await sdk.runAction({
          appKey: "StripeCLIAPI",
          actionType: "search",
          actionKey: "find_invoice",
          connection: "stripe",
          inputs: { query: f.invoiceId },
        });
        const record = (found.data?.[0] ?? undefined) as Record<string, unknown> | undefined;
        if (!record) return { found: false, resolved: false, status: "" };
        const status = String(record.status ?? "").toLowerCase();
        const remaining = Number(record.amount_remaining);
        const resolved =
          status === "paid" || status === "void" || status === "uncollectible" || record.paid === true || record.paid === "true" || remaining === 0;
        return { found: true, resolved, status };
      } catch {
        return { found: false, resolved: false, status: "" };
      }
    });
    if (latest.resolved) {
      return { invoice: label, client: who, amount: f.amountText, emailed, stopped: `invoice is ${latest.status || "settled"}`, texted: false };
    }

    // 5. Still unpaid: text the owner.
    const message = `${who} still hasn't paid ${f.amountText} on ${label}. Work is paused until the card is fixed.`.slice(0, 150);
    const sms = await ctx.step("text-owner-still-unpaid", async () =>
      sdk.runAction({
        appKey: "SMSCLIAPI",
        actionType: "write",
        actionKey: "send_v2",
        connection: "sms_owner",
        inputs: { message },
      }),
    );

    return { invoice: label, client: who, amount: f.amountText, subject, emailed, texted: Boolean(sms.data?.[0]), message };
  },
);

function toHoursText(seconds: number) {
  const hours = seconds / 3600;
  if (hours >= 1) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default workflow;
