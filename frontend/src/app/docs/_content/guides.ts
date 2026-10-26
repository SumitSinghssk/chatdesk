import type { DocPage } from "./types";

export const GUIDE_PAGES: DocPage[] = [
  {
    slug: "guides/zapier",
    title: "Connect with Zapier",
    description:
      "Link ChatDesk to 6,000+ apps like Google Sheets, HubSpot, Gmail and Slack, without writing code.",
    section: "guides",
    blocks: [
      {
        t: "p",
        text: "Zapier connects apps with “Zaps”: **when** something happens in one app (the trigger), **do** something in another (the action). ChatDesk works with Zapier through its built-in **Webhooks by Zapier** app, available on Zapier's paid plans.",
      },
      { t: "h2", text: "When something happens in ChatDesk → do something elsewhere" },
      { t: "p", text: "Example: add every new WhatsApp contact to a Google Sheet." },
      {
        t: "steps",
        items: [
          {
            title: "Create a Zap with a webhook trigger",
            text: "In Zapier, click **Create Zap**. For the trigger choose **Webhooks by Zapier**, then the event **Catch Hook**. Click **Continue**. Zapier shows a URL like `https://hooks.zapier.com/hooks/catch/123/abc/`. Copy it.",
          },
          {
            title: "Add it in ChatDesk",
            text: "In ChatDesk go to **Settings → Integrations → Webhooks → Add webhook**. Paste the Zapier URL, tick `contact.created` and save.",
          },
          {
            title: "Send a test",
            text: "In the webhook panel pick `contact.created` and click **Send test**. Back in Zapier, click **Test trigger**: you'll see the sample contact.",
          },
          {
            title: "Add the action",
            text: "Add an action: **Google Sheets → Create Spreadsheet Row**. Pick your sheet and map the columns, e.g. *Phone* → `data phone`, *Name* → `data profile name`.",
          },
          {
            title: "Publish",
            text: "Turn the Zap on. Every new contact now lands in your sheet within seconds.",
          },
        ],
      },
      { t: "h2", text: "When something happens elsewhere → send a WhatsApp message" },
      { t: "p", text: "Example: send an order confirmation template when a new row is added to a sheet." },
      {
        t: "steps",
        items: [
          {
            title: "Pick the trigger",
            text: "Choose the app that starts it, e.g. **Google Sheets → New Spreadsheet Row**.",
          },
          {
            title: "Add a “Custom Request” action",
            text: "Add **Webhooks by Zapier → Custom Request**. Method: `POST`. URL: `{{BASE_URL}}/messages`.",
          },
          {
            title: "Add your API key",
            text: "Under **Headers** add `Authorization` with the value `Bearer YOUR_API_KEY`, and `Content-Type` with `application/json`.",
          },
          {
            title: "Write the message",
            text: "In **Data**, paste the JSON below and replace the values with fields from your trigger (click **+** to insert them).",
          },
        ],
      },
      {
        t: "code",
        lang: "json",
        title: "Data",
        code: '{\n  "to": "PHONE FROM YOUR SHEET",\n  "type": "template",\n  "template": {\n    "name": "order_update",\n    "language": "en",\n    "body": ["NAME FROM YOUR SHEET", "ORDER NUMBER"]\n  }\n}',
      },
      {
        t: "callout",
        kind: "tip",
        text: "Use a template here: the customer probably didn't message you in the last 24 hours. See [The 24-hour rule](/docs/basics#the-24-hour-rule).",
      },
    ],
  },
  {
    slug: "guides/make",
    title: "Connect with Make",
    description: "Use Make (formerly Integromat) scenarios to connect ChatDesk with other apps.",
    section: "guides",
    blocks: [
      { t: "h2", text: "Receive ChatDesk events in Make" },
      {
        t: "steps",
        items: [
          {
            title: "Add a Custom webhook module",
            text: "Create a scenario. Add the module **Webhooks → Custom webhook**, click **Add**, give it a name and click **Save**. Copy the URL Make shows.",
          },
          {
            title: "Add it in ChatDesk",
            text: "**Settings → Integrations → Webhooks → Add webhook**: paste the URL and tick the events you need.",
          },
          {
            title: "Let Make learn the format",
            text: "In Make click **Redetermine data structure**, then in ChatDesk click **Send test**. Make now knows every field.",
          },
          {
            title: "Add the next modules",
            text: "Add what should happen next, e.g. **HubSpot → Create a contact**, and map the fields.",
          },
        ],
      },
      { t: "h2", text: "Send WhatsApp messages from Make" },
      {
        t: "steps",
        items: [
          { title: "Add an HTTP module", text: "Add **HTTP → Make a request**." },
          {
            title: "Fill it in",
            text: "URL: `{{BASE_URL}}/messages`. Method: `POST`. Body type: **Raw**, content type **JSON (application/json)**.",
          },
          { title: "Add your key", text: "Add a header `Authorization` with `Bearer YOUR_API_KEY`." },
          {
            title: "Write the body",
            text: "Paste the message JSON (see [Send a template](/docs/api/send-template)) and map your fields into it.",
          },
        ],
      },
    ],
  },
  {
    slug: "guides/google-sheets",
    title: "Save contacts and orders in Google Sheets",
    description: "Keep a live Google Sheet of new WhatsApp contacts or orders.",
    section: "guides",
    blocks: [
      {
        t: "p",
        text: "The easiest way is a Zapier or Make scenario that listens to a ChatDesk webhook and adds a row. Make your sheet first, with a header row, for example:",
      },
      {
        t: "table",
        head: ["For contacts", "For orders"],
        rows: [
          ["Date", "Date"],
          ["Name", "Order number"],
          ["Phone", "Customer"],
          ["Tags", "Total"],
          ["", "Payment"],
        ],
      },
      {
        t: "steps",
        items: [
          {
            title: "Create the trigger",
            text: "Follow [Connect with Zapier](/docs/guides/zapier) (or [Make](/docs/guides/make)) to catch a ChatDesk webhook.",
          },
          {
            title: "Choose the event",
            text: "In ChatDesk tick `contact.created` for contacts, or `order.created` for orders.",
          },
          {
            title: "Add a row",
            text: "Add the action **Google Sheets → Create Spreadsheet Row** and map: Date → `created_at`, Phone → `data phone`, Order number → `data number`, Total → `data total`.",
          },
        ],
      },
      {
        t: "callout",
        kind: "info",
        text: "Want your existing contacts too? Download them from **Contacts → Export** in ChatDesk and paste them into the sheet once.",
      },
    ],
  },
  {
    slug: "guides/website-orders",
    title: "Send order updates from your website",
    description: "Send a WhatsApp confirmation from your own website's backend when an order is placed.",
    section: "guides",
    blocks: [
      {
        t: "steps",
        items: [
          {
            title: "Make a template",
            text: "In ChatDesk → **Templates**, create a **Utility** template, e.g. `order_confirmed`: “Hi {{1}}, thanks for your order {{2}} of {{3}}. We'll send tracking details soon.” Wait for approval.",
          },
          {
            title: "Create an API key",
            text: "**Settings → Integrations → API keys**. Save it in your server's settings (an environment variable), never in browser code.",
          },
          {
            title: "Call the API after checkout",
            text: "When an order is placed, send the template from your server:",
          },
        ],
      },
      {
        t: "codetabs",
        samples: [
          {
            label: "Node.js",
            lang: "js",
            code: 'async function sendOrderConfirmation(order) {\n  const res = await fetch("{{BASE_URL}}/messages", {\n    method: "POST",\n    headers: {\n      Authorization: `Bearer ${process.env.CHATDESK_API_KEY}`,\n      "Content-Type": "application/json",\n    },\n    body: JSON.stringify({\n      to: order.phone,\n      type: "template",\n      name: order.customerName,\n      template: {\n        name: "order_confirmed",\n        language: "en",\n        body: [order.customerName, order.number, `₹${order.total}`],\n      },\n    }),\n  });\n  const result = await res.json();\n  if (!result.status) console.error("WhatsApp not sent:", result.message);\n}',
          },
          {
            label: "PHP (WooCommerce)",
            lang: "php",
            code: "add_action('woocommerce_thankyou', function ($order_id) {\n    $order = wc_get_order($order_id);\n    wp_remote_post('{{BASE_URL}}/messages', [\n        'headers' => [\n            'Authorization' => 'Bearer ' . getenv('CHATDESK_API_KEY'),\n            'Content-Type'  => 'application/json',\n        ],\n        'body' => wp_json_encode([\n            'to'       => $order->get_billing_phone(),\n            'type'     => 'template',\n            'template' => [\n                'name'     => 'order_confirmed',\n                'language' => 'en',\n                'body'     => [$order->get_billing_first_name(), '#' . $order->get_order_number(), $order->get_formatted_order_total()],\n            ],\n        ]),\n    ]);\n});",
          },
          {
            label: "Python",
            lang: "python",
            code: 'import os, requests\n\ndef send_order_confirmation(order):\n    res = requests.post(\n        "{{BASE_URL}}/messages",\n        headers={"Authorization": f"Bearer {os.environ[\'CHATDESK_API_KEY\']}"},\n        json={\n            "to": order["phone"],\n            "type": "template",\n            "template": {\n                "name": "order_confirmed",\n                "language": "en",\n                "body": [order["name"], order["number"], f"₹{order[\'total\']}"],\n            },\n        },\n        timeout=15,\n    )\n    if not res.json()["status"]:\n        print("WhatsApp not sent:", res.json()["message"])',
          },
        ],
      },
      {
        t: "callout",
        kind: "tip",
        text: "Use your store's phone number field with the country code. If customers type numbers without it, add your country code before sending (e.g. `+91` for India).",
      },
      {
        t: "p",
        text: "Using Shopify or WooCommerce? ChatDesk can do this without code: connect your store in **Commerce → Settings** and order updates are sent automatically.",
      },
    ],
  },
];

export const HELP_PAGES: DocPage[] = [
  {
    slug: "errors",
    title: "Errors and fixes",
    description: "The errors you're most likely to see, what they mean and how to fix them.",
    section: "help",
    blocks: [
      {
        t: "table",
        head: ["Message", "Why", "Fix"],
        rows: [
          ["Add your API key", "No key was sent", "Add the header `Authorization: Bearer YOUR_API_KEY`"],
          [
            "This API key isn't valid",
            "The key is mistyped or was deleted",
            "Copy it again, or create a new key",
          ],
          [
            "The 24-hour window is closed",
            "The customer hasn't messaged you in 24 hours",
            "Send a [template](/docs/api/send-template) instead",
          ],
          [
            "No approved template “…”",
            "Wrong name or language, or not approved yet",
            "Check [GET /templates](/docs/api/list-templates)",
          ],
          [
            "Fill in every variable in the template",
            "`template.body` has too few or too many values, or one is empty",
            "Send one value per `variables.body` entry",
          ],
          [
            "This contact opted out",
            "They replied STOP",
            "Don't send marketing; they can reply START to opt back in",
          ],
          [
            "This contact is blocked",
            "Your team blocked them",
            "Unblock them in ChatDesk if it was a mistake",
          ],
          [
            "Use a phone number with its country code",
            "The number is too short or has no country code",
            "Send it like `+9198XXXXXXXX`",
          ],
          [
            "Couldn't download the file",
            "The media link isn't public or is broken",
            "Open the link in a private browser window to check",
          ],
          [
            "Too many requests",
            "Over 120 requests a minute with one key",
            "Slow down; wait the seconds in `Retry-After`",
          ],
        ],
      },
      { t: "h2", text: "WhatsApp error codes" },
      {
        t: "p",
        text: "When WhatsApp refuses a message, its code is in `error.code` (in the API response, or in the `message.failed` webhook). The most common:",
      },
      {
        t: "table",
        head: ["Code", "Meaning"],
        rows: [
          ["`131047`", "More than 24 hours since the customer's last message: use a template"],
          [
            "`131026`",
            "The message couldn't be delivered: the number may not be on WhatsApp, or the customer's app is too old",
          ],
          [
            "`131049`",
            "WhatsApp didn't deliver a marketing message to keep users' experience good. Try later, or send fewer",
          ],
          ["`131056`", "Too many messages to the same person too quickly"],
          ["`132001`", "The template doesn't exist in that language"],
          ["`190`", "Your WhatsApp access token expired. Update it in ChatDesk → WhatsApp setup"],
        ],
      },
      { t: "h2", text: "Still stuck?" },
      {
        t: "p",
        text: "Check the message in your ChatDesk **Team inbox**: failed messages show the reason there too. For webhooks, open the webhook's delivery log to see exactly what your server answered.",
      },
    ],
  },
];
