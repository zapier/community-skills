import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

// Who gets the reply drafts, and where 5-star reviews are collected.
const OWNER_EMAIL = "you@yourbusiness.com"; // ask the user
const TESTIMONIAL_SHEET_ID = "YOUR_SPREADSHEET_ID"; // the "Testimonial Tuesday" sheet
const TESTIMONIAL_WORKSHEET_ID = "0";
// How replies should sound. Edit this to match the owner.
const OWNER_VOICE =
  "Warm, plain-spoken small business owner. First person. Short sentences. Grateful but not gushing. No corporate phrases.";

// Triggers: Webhooks by Zapier Catch Hook (any review site or form can POST to it),
// plus Google Business Profile "New Review" (GoogleMyBusinessCLIAPI new_review_v3,
// connection alias gbp_reviews). Both payload shapes are handled below.

const GBP_STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function normalizeInput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { review_text: raw };
    }
  }
  return (raw ?? {}) as Record<string, unknown>;
}

// Deterministic star parse for known shapes: GBP "FIVE", "5", "5/5", "4.0 stars".
function parseStars(review: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(review)) {
    if (!/star|rating|score/i.test(key)) continue;
    const text = String(value ?? "").trim().toUpperCase();
    if (GBP_STARS[text]) return GBP_STARS[text];
    const match = text.match(/^(\d(?:\.\d)?)/);
    if (match) {
      const n = Math.round(Number(match[1]));
      if (n >= 1 && n <= 5) return n;
    }
  }
  return null;
}

const workflow = defineDurable<unknown, unknown>(
  "google-review-reply-draft",
  async (ctx, rawInput) => {
    const review = normalizeInput(rawInput);
    const reviewJson = JSON.stringify(review);

    const drafted = await ctx.step("read-review-and-draft-reply", async () =>
      sdk.runAction({
        appKey: "AICLIAPI",
        actionType: "write",
        actionKey: "get_completion",
        inputs: {
          authentication_id: "0",
          model_id: "standard/auto",
          includeWorkflowData: "false",
          instructions:
            "You receive one customer review as JSON. It may come from Google Business Profile (starRating like FIVE, comment, reviewer.displayName) or from any other review site with messy field names (rating, stars, score, Reviewer Name, review_body, text, platform, url). " +
            "Extract: reviewer (first name plus last initial, e.g. 'Dana K.', or 'A customer' if absent), stars (whole number 1 to 5 as a string), source (Google, Yelp, Facebook, etc.; 'Google' if the payload looks like Google Business Profile), review_text (the review as written, trimmed), link (a URL to the review if present, else empty). " +
            "Then write reply: the owner's public reply to this review, in this voice: " + OWNER_VOICE + " " +
            "Rules for reply: 2 to 4 sentences, under 400 characters. Use the reviewer's first name. Reference one specific detail from the review (a person, a task, a moment) so it could not be pasted under any other review. " +
            "Never open with 'Thank you for your review' or 'We appreciate your feedback'. No emojis, no hashtags, no exclamation marks in a row, no em dashes. " +
            "For 1 to 3 stars: acknowledge the specific problem without excuses or arguing, do not admit legal fault, and invite them to contact the owner directly to make it right. For 4 to 5 stars: be specific and human, end with a light, non-salesy line. " +
            "Then write pull_quote: the single best sentence from review_text, copied verbatim, under 120 characters (empty if stars below 4). " +
            "Then write alert: a text message under 130 characters for the owner, e.g. '1-star Google review from Sam T.: cold food, 40 min wait. Reply draft in your email.' " +
            "Never invent facts that are not in the review.",
          inputFields: { review: reviewJson },
          outputSchema: {
            reviewer: "First name plus last initial, or A customer",
            stars: "Whole number 1 to 5 as a string",
            source: "Review site name",
            review_text: "The review text as written",
            link: "URL to the review, or empty",
            reply: "Owner's public reply draft, under 400 chars",
            pull_quote: "Best verbatim sentence under 120 chars, empty if under 4 stars",
            alert: "SMS alert for the owner under 130 chars",
          },
        },
      }),
    );

    const ai = (drafted.data?.[0] ?? {}) as Record<string, string>;
    const stars = parseStars(review) ?? (Math.round(Number(ai.stars)) || 0);
    const reviewer = ai.reviewer || "A customer";
    const source = ai.source || "Google";
    const reply = ai.reply ?? "";
    const starText = stars > 0 ? "★".repeat(stars) + "☆".repeat(5 - stars) : "unrated";

    // 1 or 2 stars: text the owner right away (SMS by Zapier only texts the verified owner number).
    const isLow = stars > 0 && stars <= 2;
    let alert: unknown = null;
    if (isLow) {
      const smsText = (ai.alert || `${stars}-star ${source} review from ${reviewer}. Reply draft in your email.`).slice(0, 150);
      alert = await ctx.step("text-owner-low-star-alert", async () =>
        sdk.runAction({
          appKey: "SMSCLIAPI",
          actionType: "write",
          actionKey: "send_v2",
          connection: "sms_owner",
          inputs: { message: smsText },
        }),
      );
    }

    // Owner approval: every draft goes to the owner by email first. Nothing is posted publicly.
    const subject = `${starText} ${reviewer} on ${source}: reply draft ready${isLow ? " (needs you today)" : ""}`;
    const body = [
      `New ${stars || "?"}-star review on ${source} from ${reviewer}:`,
      "",
      `"${ai.review_text ?? ""}"`,
      "",
      "Suggested reply (edit it, then post it on the review):",
      "",
      reply,
      "",
      ai.link ? `Review: ${ai.link}` : "",
      "Nothing has been posted. You approve every reply.",
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n");

    const email = await ctx.step("email-owner-reply-draft", async () =>
      sdk.runAction({
        appKey: "GoogleMailV2CLIAPI",
        actionType: "write",
        actionKey: "message",
        connection: "gmail_owner",
        inputs: { to: [OWNER_EMAIL], subject, body, body_type: "plain" },
      }),
    );

    // 5 stars: add a row to the Testimonial Tuesday sheet.
    let testimonial: unknown = null;
    if (stars === 5) {
      const addedAt = await ctx.step("capture-review-date", async () => new Date().toISOString().slice(0, 10));
      testimonial = await ctx.step("add-testimonial-tuesday-row", async () =>
        sdk.runAction({
          appKey: "GoogleSheetsV2CLIAPI",
          actionType: "write",
          actionKey: "add_row",
          connection: "sheets_testimonials",
          inputs: {
            spreadsheet: TESTIMONIAL_SHEET_ID,
            worksheet: TESTIMONIAL_WORKSHEET_ID,
            "COL$A": addedAt,
            "COL$B": reviewer,
            "COL$C": String(stars),
            "COL$D": source,
            "COL$E": ai.pull_quote ?? "",
            "COL$F": ai.review_text ?? "",
            "COL$G": reply,
            "COL$H": ai.link ?? "",
          },
        }),
      );
    }

    return {
      reviewer,
      stars,
      source,
      reply,
      emailed: Boolean(email.data?.[0]),
      texted: Boolean(alert),
      testimonial_row: Boolean(testimonial),
    };
  },
);

export default workflow;
