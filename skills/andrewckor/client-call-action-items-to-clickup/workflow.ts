import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";

const sdk = createZapierSdk();

// Who owns what. Ask the user. Keys are lowercase first names or emails as they show up in Fathom.
// clickup = the ClickUp assignee email, slack = the Slack member ID to DM (Profile > ... > Copy member ID).
const OWNER_MAP: Record<string, { name: string; clickup: string; slack: string }> = {
  sam: { name: "Sam", clickup: "sam@your-agency.example", slack: "SLACK_MEMBER_ID_SAM" },
  priya: { name: "Priya", clickup: "priya@your-agency.example", slack: "SLACK_MEMBER_ID_PRIYA" },
};
const DEFAULT_OWNER = "sam"; // gets any item whose owner isn't in OWNER_MAP

// Where tasks go in ClickUp. Ask the user (ids come from the ClickUp dropdowns once connected).
const CLICKUP_WORKSPACE_ID = "CLICKUP_WORKSPACE_ID";
const CLICKUP_SPACE_ID = "CLICKUP_SPACE_ID";
const CLICKUP_FOLDER_ID = "CLICKUP_FOLDER_ID";
const CLICKUP_LIST_ID = "CLICKUP_LIST_ID";
const CLICKUP_TAG = "client-call"; // added to every task, and what the 5pm digest looks for
const DEFAULT_DUE_DAYS = 2; // business days, when the call never named a date

// Trigger: Fathom "New Action Item" (FathomCLIAPI actionitem, connection alias fathom).
// The same workflow, published a second time on Schedule by Zapier "Every Day" at 5:00 PM, sends the digest.
// Any payload with schedule fields (pretty_date, day_of_week...) or {"digest": true} runs the digest path.
// Connection aliases: fathom (trigger), clickup, slack. AI by Zapier uses its managed authentication_id "0".

type Flat = Record<string, unknown>;

function normalizeInput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { action_item: raw };
    }
  }
  return (raw ?? {}) as Record<string, unknown>;
}

// Flatten nested keys (recording.meeting_title -> recordingmeetingtitle) so Fathom and messy webhook fields match the same rules.
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
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

function readActionItem(payload: Record<string, unknown>) {
  const flat = flatten(payload);
  const attendees = Object.entries(flat)
    .filter(([k, v]) => /(attendee|invitee|participant|calendarinvitees)/.test(k) && /(name|email)$/.test(k) && filled(v))
    .map(([, v]) => String(v))
    .slice(0, 20);
  return {
    text: pick(flat, [/^(actionitem|action_item)?(description|text|content|body)$/, /actionitem(description|text)?$/, /^(task|todo|item|description|text|note)$/, /(description|text)$/]),
    assignee: pick(flat, [/assignee(name|displayname)?$/, /(owner|assignedto|assigned|who)(name)?$/, /assignee.*name/]),
    assigneeEmail: pick(flat, [/assignee.*email|owner.*email|assigned.*email/], (v) => EMAIL_RE.test(String(v ?? ""))),
    meetingTitle: pick(flat, [/(meeting|recording|call)(title|name)$/, /^title$|^name$|topic|subject/]),
    meetingUrl: pick(flat, [/(share|recording|meeting|call)url$|^url$|link$/], (v) => /^https?:\/\//i.test(String(v ?? ""))),
    meetingDate: pick(flat, [/(meeting|recording|call|scheduled).*(start|date|time)|createdat|^date$|timestamp/], isDate),
    timestamp: pick(flat, [/playbacktime|recordingtimestamp|timestamp$|^time$/], (v) => /^\d{1,2}:\d{2}/.test(String(v ?? ""))),
    clientHint: pick(flat, [/(client|customer|company|account|domain)(name)?$/]),
    attendees,
  };
}

function isDigestRun(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  return payload.digest === true || String(payload.digest) === "true" || keys.some((k) => /^(pretty_?date|pretty_?time|day_of_week|time_of_day)$/.test(k));
}

function findOwner(name: string, email: string) {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const key = [email.toLowerCase(), first].find((k) => k && OWNER_MAP[k]) ??
    Object.keys(OWNER_MAP).find((k) => OWNER_MAP[k].clickup.toLowerCase() === email.toLowerCase());
  return { key: key ?? DEFAULT_OWNER, ...(OWNER_MAP[key ?? DEFAULT_OWNER] ?? OWNER_MAP[DEFAULT_OWNER]), matched: Boolean(key) };
}

// Calendar math without Date objects (durable workflows only allow new Date()/Date.now() inside steps).
function toDays(iso: string) {
  const [y0, m, d] = iso.slice(0, 10).split("-").map(Number);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + (yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy) - 719468;
}
function fromDays(n: number) {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const weekday = (n: number) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday
function addBusinessDays(fromIso: string, days: number) {
  let n = toDays(fromIso);
  let left = days;
  while (left > 0) {
    n++;
    if (weekday(n) !== 0 && weekday(n) !== 6) left--;
  }
  return fromDays(n);
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return "no date";
  const n = toDays(iso);
  const [, m, d] = fromDays(n).split("-").map(Number);
  return `${DOW[weekday(n)]}, ${MON[m - 1]} ${d}`;
}
const msToIso = (ms: number) => fromDays(Math.floor(ms / 86400000));

// Find the task list in a ClickUp API response, wherever the request action put it.
function findTasks(obj: unknown): Record<string, unknown>[] {
  if (typeof obj === "string") {
    try {
      return findTasks(JSON.parse(obj));
    } catch {
      return [];
    }
  }
  if (Array.isArray(obj)) return obj.flatMap(findTasks);
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.tasks)) return o.tasks as Record<string, unknown>[];
    return Object.values(o).flatMap(findTasks);
  }
  return [];
}

const workflow = defineDurable<unknown, unknown>(
  "client-call-action-items-to-clickup",
  async (ctx, rawInput) => {
    const payload = normalizeInput(rawInput);

    // 5pm digest: every open client-call task, grouped by owner, one Slack DM each.
    if (isDigestRun(payload)) {
      const now = await ctx.step("capture-digest-time", async () => Date.now());
      const listed = await ctx.step("list-open-call-tasks", async () =>
        sdk.runAction({
          appKey: "ClickUpCLIAPI",
          actionType: "write",
          actionKey: "_zap_raw_request",
          connection: "clickup",
          inputs: {
            fail_on_errors: "true",
            method: "GET",
            url: `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`,
            querystring: { "tags[]": CLICKUP_TAG, include_closed: "false", subtasks: "true" },
          },
        }),
      );
      const tasks = findTasks(listed.data ?? listed);
      const byOwner: Record<string, string[]> = {};
      for (const t of tasks) {
        const assignees = (t.assignees as { email?: string; username?: string }[] | undefined) ?? [];
        const owner = findOwner(assignees[0]?.username ?? "", assignees[0]?.email ?? "");
        const dueMs = Number(t.due_date ?? 0);
        const late = dueMs > 0 && dueMs < now ? " (overdue)" : "";
        const due = dueMs > 0 ? prettyDate(msToIso(dueMs)) : "no date";
        (byOwner[owner.key] ??= []).push(`- ${t.name} | due ${due}${late} | ${t.url ?? ""}`);
      }
      const sent: string[] = [];
      for (const [key, lines] of Object.entries(byOwner)) {
        const owner = OWNER_MAP[key];
        const text = `Open client call action items (${lines.length}):\n${lines.join("\n")}`;
        await ctx.step(`dm-digest-${key}`, async () =>
          sdk.runAction({
            appKey: "SlackCLIAPI",
            actionType: "write",
            actionKey: "direct_message",
            connection: "slack",
            inputs: { channel: owner.slack, text, as_bot: "true", unfurl: "false" },
          }),
        );
        sent.push(`${owner.name}: ${lines.length}`);
      }
      return { mode: "digest", openTasks: tasks.length, sent };
    }

    // New action item: work out owner, due date and client, file it in ClickUp, DM the owner.
    const item = readActionItem(payload);
    if (!item.text) return { mode: "item", skipped: "no action item text in the payload" };

    const meetingDate = item.meetingDate || (await ctx.step("capture-item-time", async () => new Date().toISOString()));
    const extracted = await ctx.step("extract-owner-due-client", async () =>
      sdk.runAction({
        appKey: "AICLIAPI",
        actionType: "write",
        actionKey: "get_completion",
        inputs: {
          authentication_id: "0",
          model_id: "standard/auto",
          includeWorkflowData: "false",
          instructions:
            "You turn one action item from a recorded client call into a task. " +
            "Owner: the person on our team who has to do it. Use the assignee if given, else the person the text names. Return their name exactly as written, or empty if unclear. " +
            "Due date: resolve what was said (\"by Friday\", \"end of next week\", \"tomorrow\") against the meeting date and return YYYY-MM-DD. Empty if no timing was said. Never invent one. " +
            "Client: the client company the work is for, from the text, meeting title, client hint or attendee email domains. Empty if unclear. " +
            "Task title: start with a verb, under 80 characters, specific, no filler. Keep names, numbers and deliverables exactly as said.",
          inputFields: {
            action_item: item.text,
            assignee: item.assignee,
            assignee_email: item.assigneeEmail,
            meeting_title: item.meetingTitle,
            meeting_date: meetingDate.slice(0, 10),
            client_hint: item.clientHint,
            attendees: item.attendees.join(", "),
          },
          outputSchema: {
            owner_name: "Owner's name as written, or empty",
            due_date: "YYYY-MM-DD or empty",
            client: "Client company name, or empty",
            task_title: "Task title starting with a verb, under 80 characters",
          },
        },
      }),
    );
    const ai = (extracted.data?.[0] ?? {}) as Record<string, string>;
    const owner = findOwner(ai.owner_name || item.assignee, item.assigneeEmail);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(ai.due_date ?? "") ? ai.due_date : addBusinessDays(meetingDate, DEFAULT_DUE_DAYS);
    const client = ai.client || item.clientHint || "Client";
    const title = `${client}: ${ai.task_title || item.text}`.slice(0, 120);
    const description = [
      `From the call: ${item.meetingTitle || "client call"} (${prettyDate(meetingDate.slice(0, 10))})`,
      `What was said: ${item.text}`,
      item.timestamp ? `At: ${item.timestamp}` : "",
      item.meetingUrl ? `Recording: ${item.meetingUrl}` : "",
      ai.due_date ? "" : `No date was said on the call, so this defaults to ${DEFAULT_DUE_DAYS} business days.`,
    ].filter(Boolean).join("\n");

    const created = await ctx.step("create-clickup-task", async () =>
      sdk.runAction({
        appKey: "ClickUpCLIAPI",
        actionType: "write",
        actionKey: "task",
        connection: "clickup",
        inputs: {
          team_id: CLICKUP_WORKSPACE_ID,
          space_id: CLICKUP_SPACE_ID,
          folder_id: CLICKUP_FOLDER_ID,
          list_id: CLICKUP_LIST_ID,
          name: title,
          content: description,
          markdown: "false",
          assignees: [owner.clickup],
          due_date: `${due}T17:00:00`,
          tags: [CLICKUP_TAG],
        },
      }),
    );
    const task = (created.data?.[0] ?? {}) as Record<string, string>;
    const taskUrl = task.url || (task.id ? `https://app.clickup.com/t/${task.id}` : "");

    const text =
      `New action item from your call${client !== "Client" ? ` with ${client}` : ""}: ${ai.task_title || item.text}\n` +
      `Due ${prettyDate(due)}${ai.due_date ? "" : " (no date said on the call)"}\n${taskUrl}`;
    await ctx.step("dm-owner-task-link", async () =>
      sdk.runAction({
        appKey: "SlackCLIAPI",
        actionType: "write",
        actionKey: "direct_message",
        connection: "slack",
        inputs: { channel: owner.slack, text, as_bot: "true", unfurl: "false" },
      }),
    );

    return { mode: "item", owner: owner.name, ownerMatched: owner.matched, client, due, title, taskId: task.id ?? "", taskUrl };
  },
);

export default workflow;
