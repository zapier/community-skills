import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

const workflow = defineDurable<unknown, unknown>(
  "sms-lead-alert",
  async (ctx, input) => {
    const lead = typeof input === "string" ? input : JSON.stringify(input ?? {});

    const extraction = await ctx.step("extract-lead-and-draft-reply", async () =>
      sdk.runAction({
        appKey: "AICLIAPI",
        actionType: "write",
        actionKey: "get_completion",
        inputs: {
          authentication_id: "0",
          model_id: "standard/auto",
          includeWorkflowData: "false",
          instructions:
            "You receive a website form submission as JSON. Field names may be missing or oddly named (e.g. full_name, first/last, tel, mobile, phone_number, msg, comments, details). " +
            "Extract: name (the lead's full name as given, or 'Unknown' if absent), phone (the lead's phone number exactly as given, or 'no phone' if absent), " +
            "need (a short summary under 45 characters: the problem, then the city if given, then a timing word like today, tomorrow, this afternoon, or ASAP if given, comma separated, e.g. 'Leaking water heater, Union City, today'), " +
            "and reply (a friendly text the business owner could send back, under 60 characters, using the lead's first name, proposing a concrete time if the lead asked for a time, e.g. 'Hi Maria, I can come by this afternoon. Does 3pm work?'). " +
            "No emojis. Never invent a phone number.",
          inputFields: { lead_submission: lead },
          outputSchema: {
            name: "Lead's full name, or Unknown",
            phone: "Lead's phone number as given, or no phone",
            need: "Need summary under 45 chars with city and timing if given",
            reply: "Suggested friendly reply under 60 chars using first name",
          },
        },
      }),
    );

    const { name, phone, need, reply } = (extraction.data?.[0] ?? {}) as Record<string, string>;
    const message = `${name ?? "Unknown"}\n${phone ?? "no phone"}\n\n${need ?? "New inquiry"}\n\nReply: "${reply ?? ""}"`;

    const sms = await ctx.step("text-owner-lead-alert", async () =>
      sdk.runAction({
        appKey: "SMSCLIAPI",
        actionType: "write",
        actionKey: "send_v2",
        connection: "sms_owner",
        inputs: { message },
      }),
    );

    return { message, length: message.length, sms: sms.data?.[0] ?? null };
  },
);

export default workflow;
