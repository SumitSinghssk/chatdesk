import { shot } from "./shots";
import type { DocPage } from "./types";

export const GETTING_STARTED: DocPage[] = [
  {
    slug: "",
    title: "ChatDesk developer docs",
    description:
      "Connect ChatDesk to your website, app, CRM or tools like Zapier. Send WhatsApp messages, manage contacts and get told the moment something happens.",
    section: "start",
    blocks: [
      {
        t: "p",
        text: "ChatDesk gives you two simple tools to connect your WhatsApp number with everything else you use:",
      },
      {
        t: "list",
        items: [
          "**The API**: your website or app *asks* ChatDesk to do something, for example “send this order confirmation to +91 98XXX XXXXX”.",
          "**Webhooks**: ChatDesk *tells* your system when something happens, for example “a customer just replied” or “a new order came in”.",
        ],
      },
      {
        t: "cards",
        items: [
          {
            title: "Quickstart",
            text: "Create a key and send your first message in 5 minutes.",
            href: "/docs/quickstart",
            icon: "rocket",
          },
          {
            title: "Send a message",
            text: "Text, templates, images and documents.",
            href: "/docs/api/send-message",
            icon: "send",
          },
          {
            title: "Webhooks",
            text: "Get new messages, read receipts and orders as they happen.",
            href: "/docs/webhooks",
            icon: "webhook",
          },
          {
            title: "Zapier & Make",
            text: "Connect thousands of apps without writing code.",
            href: "/docs/guides/zapier",
            icon: "zap",
          },
        ],
      },
      { t: "h2", text: "What you can build" },
      {
        t: "table",
        head: ["Idea", "How"],
        rows: [
          ["Order confirmations and delivery updates from your website", "API: send a template message"],
          ["Save every new WhatsApp lead in your CRM", "Webhook: `contact.created`"],
          ["Show customer replies in your own app", "Webhook: `message.received`"],
          ["Add a row to Google Sheets for every order", "Webhook `order.created` + Zapier or Make"],
          ["OTP and login codes on WhatsApp", "API: send an authentication template"],
          ["Tag customers from your billing system", "API: update a contact"],
        ],
      },
      { t: "h2", text: "How it works in one picture" },
      {
        t: "steps",
        items: [
          {
            title: "Your app calls the API",
            text: "It sends a request to ChatDesk with your API key, like `POST /messages`.",
          },
          {
            title: "ChatDesk sends it on WhatsApp",
            text: "The message goes out from your connected WhatsApp number and shows in your Team inbox, just like messages your team sends.",
          },
          {
            title: "ChatDesk calls your webhook",
            text: "When the message is delivered or read, or the customer replies, ChatDesk sends the details to your webhook URL.",
          },
        ],
      },
      {
        t: "callout",
        kind: "tip",
        title: "No coding?",
        text: "You can still use all of this through [Zapier](/docs/guides/zapier) or [Make](/docs/guides/make). They handle the technical part for you.",
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart: your first message in 5 minutes",
    description: "Create an API key in ChatDesk and send a WhatsApp message with one request.",
    section: "start",
    blocks: [
      {
        t: "callout",
        kind: "info",
        title: "Before you start",
        text: "Your WhatsApp number must be connected in **WhatsApp setup**, and you must be the owner or an admin of the workspace.",
      },
      { t: "h2", text: "Step 1: Create an API key" },
      {
        t: "steps",
        items: [
          {
            title: "Open Integrations",
            text: "Sign in to ChatDesk. In the left menu, under **Settings**, click **Integrations**.",
            image: shot("integrations-page", "The Integrations page with the API keys tab open"),
          },
          {
            title: "Click “Create API key”",
            text: "Give the key a name you'll recognise later, such as the website or app that will use it, then click **Create key**.",
            image: shot("create-key", "The Create an API key window with a name typed in"),
          },
          {
            title: "Copy the key and keep it safe",
            text: "The key starts with `cdk_`. It is shown **only once**, so copy it now and save it in your app's settings or a password manager.",
            image: shot("key-created", "The new API key, shown once with a Copy button"),
          },
        ],
      },
      {
        t: "callout",
        kind: "warning",
        title: "Treat the key like a password",
        text: "Anyone with your key can send messages from your number. Never put it in website code that visitors can see (like JavaScript in the browser). Use it only on your server.",
      },
      { t: "h2", text: "Step 2: Check the key works" },
      {
        t: "p",
        text: "Run this in a terminal (replace `YOUR_API_KEY`). You can also use the **Try it** button on the [GET /me](/docs/api/me) page right here in the docs.",
      },
      {
        t: "code",
        lang: "bash",
        code: 'curl {{BASE_URL}}/me \\\n  -H "Authorization: Bearer YOUR_API_KEY"',
      },
      { t: "p", text: "If the key is right, you get your number's details back:" },
      {
        t: "json",
        title: "Response",
        status: 200,
        value: {
          status: true,
          data: {
            id: 12,
            name: "Main number",
            phone: "+91 98XXX XXXXX",
            business: "Your Business",
            connected: true,
          },
        },
      },
      { t: "h2", text: "Step 3: Send a message" },
      {
        t: "p",
        text: "WhatsApp has one important rule: you can send a **normal text** only to someone who messaged you in the **last 24 hours**. To start a conversation, you send an approved **template** instead. [Learn more](/docs/basics#the-24-hour-rule).",
      },
      {
        t: "p",
        text: "So the easiest first test is: send “Hi” to your business number from your own phone, then run:",
      },
      {
        t: "codetabs",
        samples: [
          {
            label: "cURL",
            lang: "bash",
            code: 'curl -X POST {{BASE_URL}}/messages \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"to": "+9198XXXXXXXX", "text": "Hello from the API!"}\'',
          },
          {
            label: "JavaScript",
            lang: "js",
            code: 'const res = await fetch("{{BASE_URL}}/messages", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ to: "+9198XXXXXXXX", text: "Hello from the API!" }),\n});\nconsole.log(await res.json());',
          },
          {
            label: "Python",
            lang: "python",
            code: 'import requests\n\nres = requests.post(\n    "{{BASE_URL}}/messages",\n    headers={"Authorization": "Bearer YOUR_API_KEY"},\n    json={"to": "+9198XXXXXXXX", "text": "Hello from the API!"},\n)\nprint(res.json())',
          },
        ],
      },
      {
        t: "p",
        text: "Use your own phone number in `to`. The message arrives on your phone and also appears in your ChatDesk **Team inbox**, marked as sent by the API.",
      },
      { t: "h2", text: "What next?" },
      {
        t: "list",
        items: [
          "Send a [template message](/docs/api/send-template) to people who haven't written to you yet.",
          "Add a [webhook](/docs/webhooks) to hear about replies and read receipts.",
          "Read [The basics](/docs/basics): phone number format, errors and limits.",
        ],
      },
    ],
  },
  {
    slug: "authentication",
    title: "Authentication",
    description: "Every API request needs an API key. Here's how to send it, and how to keep it safe.",
    section: "start",
    blocks: [
      {
        t: "p",
        text: "Send your API key in the `Authorization` header of every request, after the word `Bearer`:",
      },
      { t: "code", lang: "http", code: "Authorization: Bearer cdk_your_api_key" },
      {
        t: "p",
        text: "If your tool can't set an Authorization header, you can send the key in an `X-API-Key` header instead:",
      },
      { t: "code", lang: "http", code: "X-API-Key: cdk_your_api_key" },
      { t: "h2", text: "One key, one WhatsApp number" },
      {
        t: "p",
        text: "If your workspace has more than one WhatsApp number, **each number has its own keys**. A key can only send from, and read the data of, the number it was created on. To create a key for another number, switch to that number with the number switcher at the top of ChatDesk first.",
      },
      { t: "h2", text: "Managing keys" },
      {
        t: "list",
        items: [
          "Keys are made in **Settings → Integrations → API keys** by owners and admins.",
          "You can have up to 10 keys per number. Use one key per app, so you can turn off one app without affecting the others.",
          "The list shows when each key was last used, so you can spot keys nobody uses any more.",
          "**Deleting a key stops it immediately.** Any app still using it gets a `401` error.",
        ],
      },
      { t: "h2", text: "If a key is leaked" },
      {
        t: "steps",
        items: [
          { title: "Create a new key", text: "Make a new key and put it in your app." },
          { title: "Delete the old key", text: "Delete the leaked key. It stops working at once." },
          {
            title: "Check your inbox",
            text: "Look for messages marked “API (key name)” that you didn't send.",
          },
        ],
      },
      { t: "h2", text: "Errors" },
      {
        t: "table",
        head: ["Status", "Meaning", "What to do"],
        rows: [
          ["`401`", "No key, or the key is wrong or deleted", "Check the header and the key"],
          ["`403`", "The account is suspended", "Contact support"],
          [
            "`429`",
            "More than 120 requests in a minute with this key",
            "Wait the seconds given in `Retry-After`",
          ],
        ],
      },
    ],
  },
  {
    slug: "basics",
    title: "The basics",
    description:
      "Base URL, request and response format, phone numbers, the 24-hour rule, pages, limits and errors.",
    section: "start",
    blocks: [
      { t: "h2", text: "Base URL" },
      { t: "p", text: "All API addresses in these docs start with:" },
      { t: "code", lang: "text", code: "{{BASE_URL}}" },
      { t: "h2", text: "Requests and responses" },
      {
        t: "list",
        items: [
          "Send request bodies as JSON with the header `Content-Type: application/json`.",
          "Every response is JSON with the same shape: `status` is `true` or `false`, the result is in `data`, and a human-friendly `message` explains what happened.",
          "Dates and times are in UTC, in ISO 8601 format, like `2026-10-26T14:30:00Z`.",
          "Amounts of money are in normal units (rupees, dollars), not paise or cents. `499.5` means ₹499.50.",
        ],
      },
      {
        t: "json",
        title: "A successful response",
        status: 200,
        value: { status: true, message: "Contact updated", data: { id: 501, phone: "+9198XXXXXXXX" } },
      },
      {
        t: "json",
        title: "An error response",
        status: 422,
        value: {
          status: false,
          message: "Use a phone number with its country code, e.g. +9198XXXXXXXX",
          errors: { to: ["Use a phone number with its country code, e.g. +9198XXXXXXXX"] },
        },
      },
      { t: "h2", text: "Phone numbers" },
      {
        t: "p",
        text: "Always include the **country code**. These all mean the same number: `+9198XXXXXXXX`, `9198XXXXXXXX`, `+91 98XXX XXXXX`. Spaces, dashes and brackets are ignored. In URLs (like `/contacts/{phone}`) use digits only: `9198XXXXXXXX`.",
      },
      { t: "h2", text: "The 24-hour rule", id: "the-24-hour-rule" },
      {
        t: "p",
        text: "This is WhatsApp's rule, not ours, and it's the most common reason a message isn't sent:",
      },
      {
        t: "list",
        items: [
          "When a customer messages you, a **24-hour window** opens. Inside it you can send anything: text, images, documents.",
          "Outside the window (or if they never messaged you), you can only send a **template**: a message format WhatsApp approved in advance.",
          "Every time the customer writes again, the window starts again from that moment.",
        ],
      },
      {
        t: "callout",
        kind: "tip",
        text: "The [conversations](/docs/api/list-conversations) endpoint tells you if the window is open (`window_open`). Templates are made in ChatDesk under **Templates**.",
      },
      { t: "h2", text: "Pages (pagination)" },
      {
        t: "p",
        text: "Lists come in pages. Use `page` (starting at 1) and `per_page` (up to 100, default 25). The `meta` part of the response tells you the `total` and whether there's another page (`has_more`).",
      },
      {
        t: "json",
        title: "meta in a list response",
        value: { meta: { page: 1, per_page: 25, total: 134, has_more: true } },
      },
      { t: "h2", text: "Limits" },
      {
        t: "table",
        head: ["Limit", "Value"],
        rows: [
          ["Requests per API key", "120 per minute"],
          ["Items per page", "Up to 100"],
          ["Text message length", "4,096 characters"],
          ["Images", "JPEG or PNG, up to 5 MB"],
          ["Video and audio", "Up to 16 MB"],
          ["Documents", "Any file, up to 100 MB"],
        ],
      },
      { t: "h2", text: "Status codes" },
      {
        t: "table",
        head: ["Code", "Meaning"],
        rows: [
          ["`200`", "OK"],
          ["`201`", "Created: a message was sent or a contact added"],
          ["`401`", "Missing or wrong API key"],
          ["`404`", "Not found, e.g. no contact with that phone number"],
          ["`422`", "Something in the request needs fixing; `message` says what"],
          ["`429`", "Too many requests; wait and try again"],
          ["`500`", "A problem on our side; try again shortly"],
        ],
      },
      {
        t: "p",
        text: "See [Errors and fixes](/docs/errors) for the common errors and how to solve them.",
      },
    ],
  },
];
