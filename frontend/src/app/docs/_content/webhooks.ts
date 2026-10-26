import { shot } from "./shots";
import type { DocPage } from "./types";

const NUMBER = { id: 12, name: "Main number", phone: "+91 98XXX XXXXX" };
const CONTACT = {
  id: 501,
  phone: "+9198XXXXXXXX",
  wa_id: "9198XXXXXXXX",
  name: "John Doe",
  profile_name: "John",
  email: null,
  tags: [],
  attributes: {},
  opted_out: false,
  blocked: false,
  source: "inbox",
  created_at: "2026-10-26T11:02:09Z",
  last_message_at: "2026-10-26T11:02:10Z",
};
const IN_MESSAGE = {
  id: 9010,
  wamid: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgUM0E",
  direction: "inbound",
  type: "text",
  text: "Hi, where is my order?",
  status: "received",
  from: "+9198XXXXXXXX",
  contact: { id: 501, phone: "+9198XXXXXXXX", name: "John Doe" },
  conversation_id: 301,
  template_name: null,
  media: null,
  reply_to_wamid: null,
  sent_by: null,
  error: null,
  created_at: "2026-10-26T11:02:10Z",
  sent_at: null,
  delivered_at: null,
  read_at: null,
};
const OUT_MESSAGE = {
  ...IN_MESSAGE,
  id: 9012,
  direction: "outbound",
  text: "It's on the way and arrives tomorrow!",
  from: undefined,
  to: "+9198XXXXXXXX",
  sent_by: "Ravi",
};

/** Every event: what it means and an example of `data`. Shown by the "events" block. */
export const EVENT_DOCS: { event: string; when: string; data: unknown }[] = [
  {
    event: "message.received",
    when: "A customer sent you a message (text, photo, file, location, button tap…).",
    data: IN_MESSAGE,
  },
  {
    event: "message.sent",
    when: "WhatsApp accepted a message you sent (from the inbox, a campaign, a chatbot or the API).",
    data: { ...OUT_MESSAGE, status: "sent", sent_at: "2026-10-26T11:03:00Z" },
  },
  {
    event: "message.delivered",
    when: "The message reached the customer's phone.",
    data: { ...OUT_MESSAGE, status: "delivered", delivered_at: "2026-10-26T11:03:02Z" },
  },
  {
    event: "message.read",
    when: "The customer opened the message (only if they have read receipts on).",
    data: { ...OUT_MESSAGE, status: "read", read_at: "2026-10-26T11:04:30Z" },
  },
  {
    event: "message.failed",
    when: "WhatsApp couldn't deliver a message you sent. `error` says why.",
    data: { ...OUT_MESSAGE, status: "failed", error: { code: 131026, message: "Message undeliverable" } },
  },
  {
    event: "contact.created",
    when: "A new contact was added: someone messaged you for the first time, or a contact was added by hand or by the API.",
    data: CONTACT,
  },
  {
    event: "contact.opted_out",
    when: "A contact replied with an opt-out word like STOP, or a chatbot opted them out.",
    data: { ...CONTACT, opted_out: true },
  },
  {
    event: "contact.opted_in",
    when: "A contact who had opted out said they want messages again (e.g. replied START).",
    data: CONTACT,
  },
  {
    event: "conversation.resolved",
    when: "A chat was marked resolved by your team or a chatbot.",
    data: {
      id: 301,
      status: "resolved",
      contact: CONTACT,
      unread_count: 0,
      last_message: "Thanks!",
      window_open: true,
      assignee: "Ravi",
      team: "Support",
    },
  },
  {
    event: "order.created",
    when: "A new order was confirmed (WhatsApp cart, chatbot, your team or your online store).",
    data: {
      id: 77,
      number: "#1042",
      status: "confirmed",
      payment_status: "unpaid",
      payment_method: "cod",
      total: 1038,
      currency: "INR",
      items: [{ name: "Kaju Katli 500 g", sku: "KK-500", quantity: 2, unit_price: 499 }],
      customer: { name: "John Doe", phone: "+9198XXXXXXXX" },
    },
  },
  {
    event: "order.paid",
    when: "An order was paid online (payment link, WhatsApp Pay) or marked paid.",
    data: {
      id: 77,
      number: "#1042",
      status: "confirmed",
      payment_status: "paid",
      payment_method: "online",
      total: 1038,
      currency: "INR",
    },
  },
  {
    event: "campaign.finished",
    when: "A campaign finished sending, or stopped because of a problem.",
    data: {
      id: 9,
      name: "Diwali offer",
      status: "completed",
      template_name: "diwali_offer",
      recipients: 1200,
      sent: 1184,
      failed: 6,
      skipped: 10,
      error: null,
      started_at: "2026-10-26T09:00:00Z",
      completed_at: "2026-10-26T09:14:22Z",
    },
  },
];

const NODE = `import crypto from "node:crypto";
import express from "express";

const app = express();
const SECRET = process.env.CHATDESK_WEBHOOK_SECRET; // whsec_...

// Read the body as raw text: the signature is made from the exact bytes we sent.
app.post("/webhooks/chatdesk", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-ChatDesk-Signature") || ""; // t=1793000000,v1=abc...
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(\`\${parts.t}.\${req.body}\`)
    .digest("hex");

  const valid = parts.v1 && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // within 5 minutes
  if (!valid || !fresh) return res.status(400).send("Bad signature");

  const event = JSON.parse(req.body);
  console.log(event.event, event.data);
  res.sendStatus(200); // answer fast; do slow work afterwards
});

app.listen(3000);`;

const PYTHON = `import hashlib, hmac, json, os, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["CHATDESK_WEBHOOK_SECRET"]  # whsec_...

@app.post("/webhooks/chatdesk")
def chatdesk():
    header = request.headers.get("X-ChatDesk-Signature", "")  # t=1793000000,v1=abc...
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    body = request.get_data()  # the raw bytes, exactly as sent
    expected = hmac.new(SECRET.encode(), f"{parts.get('t')}.".encode() + body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, parts.get("v1", "")):
        abort(400)
    if abs(time.time() - int(parts.get("t", 0))) > 300:  # older than 5 minutes
        abort(400)

    event = json.loads(body)
    print(event["event"], event["data"])
    return "", 200`;

const PHP = `<?php
$secret = getenv('CHATDESK_WEBHOOK_SECRET'); // whsec_...
$body = file_get_contents('php://input');    // the raw body, exactly as sent
$header = $_SERVER['HTTP_X_CHATDESK_SIGNATURE'] ?? '';

parse_str(str_replace(',', '&', $header), $parts); // ['t' => ..., 'v1' => ...]
$expected = hash_hmac('sha256', $parts['t'] . '.' . $body, $secret);

if (!hash_equals($expected, $parts['v1'] ?? '') || abs(time() - (int) $parts['t']) > 300) {
    http_response_code(400);
    exit('Bad signature');
}

$event = json_decode($body, true);
error_log($event['event']);
http_response_code(200);`;

export const WEBHOOK_PAGES: DocPage[] = [
  {
    slug: "webhooks",
    title: "Webhooks",
    description:
      "Get told the moment something happens: new messages, read receipts, new contacts, orders and more.",
    section: "webhooks",
    blocks: [
      {
        t: "p",
        text: "A webhook is a URL on your server. When something happens on your WhatsApp number, ChatDesk sends a `POST` request with the details to that URL, within a second or two. No need to keep asking (polling) the API.",
      },
      { t: "h2", text: "Set up a webhook" },
      {
        t: "steps",
        items: [
          {
            title: "Open Integrations → Webhooks",
            text: "In ChatDesk, go to **Settings → Integrations** and open the **Webhooks** tab. Click **Add webhook**.",
            image: shot("webhooks-tab", "The Webhooks tab with the Add webhook button"),
          },
          {
            title: "Enter your URL and choose events",
            text: "Paste the `https://` address that will receive the calls, and tick the events you want. Not sure? Start with `message.received`.",
            image: shot("add-webhook", "The Add a webhook window with a URL and events ticked"),
          },
          {
            title: "Copy the signing secret and send a test",
            text: "After saving, the webhook opens. Copy the **signing secret** (it starts with `whsec_`) into your app so it can [check each call is really from us](/docs/webhooks/verify-signatures). Then click **Send test** and check your server answered `200`.",
            image: shot(
              "webhook-detail",
              "The webhook panel with signing secret, Send test and recent deliveries"
            ),
          },
        ],
      },
      {
        t: "callout",
        kind: "tip",
        title: "No server yet?",
        text: "For testing, get a free temporary URL from a site like webhook.site and use it as your webhook. You'll see every call ChatDesk sends.",
      },
      { t: "h2", text: "What a call looks like" },
      {
        t: "p",
        text: "Every call is a `POST` with a JSON body. The `event` tells you what happened, `number` is which of your WhatsApp numbers it happened on, and `data` has the details (the same shapes the API returns).",
      },
      {
        t: "json",
        title: "Request body",
        value: {
          id: "evt_5f2b8c41a9e0d3b7c6a1f4e2",
          event: "message.received",
          created_at: "2026-10-26T11:02:11Z",
          number: NUMBER,
          data: IN_MESSAGE,
        },
      },
      {
        t: "table",
        head: ["Header", "What it is"],
        rows: [
          ["`X-ChatDesk-Event`", "The event name, e.g. `message.received`"],
          ["`X-ChatDesk-Delivery`", "The id of this delivery (useful when you talk to support)"],
          [
            "`X-ChatDesk-Signature`",
            "Proof the call came from ChatDesk. See [Verify signatures](/docs/webhooks/verify-signatures)",
          ],
          ["`User-Agent`", "`ChatDesk-Webhooks/1.0`"],
        ],
      },
      { t: "h2", text: "Your server's answer" },
      {
        t: "list",
        items: [
          "Answer with any `2xx` status (like `200`) **within 10 seconds**. Anything else counts as a failure and we [try again later](/docs/webhooks/retries).",
          "Answer first, then do slow work (sending emails, updating your CRM) in the background.",
          "Redirects aren't followed: use the final URL.",
          "The same event can, rarely, arrive twice. Use the `id` (`evt_…`) to skip ones you already handled.",
        ],
      },
      { t: "h2", text: "Good to know" },
      {
        t: "list",
        items: [
          "Each WhatsApp number has its own webhooks. With several numbers, add the webhook on each one (it can be the same URL: `number.id` tells them apart).",
          "Up to 10 webhooks per number. Each can listen to different events.",
          "You can pause a webhook with its switch. Nothing is sent or kept while it's paused.",
        ],
      },
    ],
  },
  {
    slug: "webhooks/events",
    title: "Event types",
    description: "Every event ChatDesk can send, when it's sent, and an example of its data.",
    section: "webhooks",
    blocks: [
      {
        t: "p",
        text: "Choose which events each webhook gets when you add it, or pick **All events** to get every event, including ones we add later. Click an event to see an example.",
      },
      { t: "events" },
    ],
  },
  {
    slug: "webhooks/verify-signatures",
    title: "Verify signatures",
    description: "Check that a webhook call really came from ChatDesk, with ready-to-use code.",
    section: "webhooks",
    blocks: [
      {
        t: "p",
        text: "Anyone could send a request to your webhook URL. To be sure a call came from ChatDesk, check the `X-ChatDesk-Signature` header. It looks like this:",
      },
      {
        t: "code",
        lang: "http",
        code: "X-ChatDesk-Signature: t=1793000000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd",
      },
      {
        t: "steps",
        items: [
          {
            title: "Split the header",
            text: "`t` is when we sent it (a Unix timestamp). `v1` is the signature.",
          },
          {
            title: "Make your own signature",
            text: 'Join `t`, a dot, and the **raw** request body: `1793000000.{"id":"evt_…"…}`. Make an HMAC-SHA256 of that text using your webhook\'s signing secret as the key, written as hex.',
          },
          { title: "Compare", text: "If yours equals `v1`, the call is real. Use a constant-time compare." },
          {
            title: "Check the time",
            text: "Reject calls where `t` is more than 5 minutes old. This stops someone replaying an old call.",
          },
        ],
      },
      {
        t: "callout",
        kind: "warning",
        title: "Use the raw body",
        text: "Make the signature from the body exactly as received. If your framework parses the JSON and you turn it back into text, spaces or key order can change and the signature won't match.",
      },
      { t: "h2", text: "Code" },
      {
        t: "codetabs",
        samples: [
          { label: "Node.js", lang: "js", code: NODE },
          { label: "Python", lang: "python", code: PYTHON },
          { label: "PHP", lang: "php", code: PHP },
        ],
      },
      { t: "h2", text: "Changing the secret" },
      {
        t: "p",
        text: "If the secret leaks, open the webhook in ChatDesk and click **New secret**. The old secret stops working at once, so update your app straight away.",
      },
    ],
  },
  {
    slug: "webhooks/retries",
    title: "Retries and the delivery log",
    description: "What happens when your server is down, and how to see and resend every call.",
    section: "webhooks",
    blocks: [
      {
        t: "p",
        text: "If your server doesn't answer with a `2xx` status within 10 seconds, we keep the event and try again later. Nothing is lost while your server is briefly down.",
      },
      {
        t: "table",
        head: ["Try", "When"],
        rows: [
          ["1st", "Straight away"],
          ["2nd", "1 minute later"],
          ["3rd", "5 minutes later"],
          ["4th", "30 minutes later"],
          ["5th", "2 hours later"],
          ["6th", "6 hours later"],
          ["7th (last)", "12 hours later"],
        ],
      },
      { t: "p", text: "After the 7th try (about 21 hours in all) the delivery is marked **Failed**." },
      { t: "h2", text: "The delivery log" },
      {
        t: "p",
        text: "Open a webhook in **Settings → Integrations → Webhooks** to see every call from the last 30 days: the event, what we sent, what your server answered and how long it took. Filter by **Delivered**, **Failed** or **Retrying**.",
      },
      {
        t: "image",
        shot: shot("delivery-log", "An opened delivery showing the request we sent and your server's answer"),
      },
      {
        t: "p",
        text: "Click **Send again** on any delivery to resend it now, for example after fixing a bug in your code. It keeps the same event `id`, so your code can tell it's a repeat.",
      },
      { t: "h2", text: "Health" },
      {
        t: "list",
        items: [
          "**Working**: the last calls succeeded.",
          "**Failing**: 3 or more calls in a row failed. Check the delivery log for the reason.",
          "**No calls yet**: nothing has been sent to it so far. Send a test event.",
        ],
      },
    ],
  },
];
