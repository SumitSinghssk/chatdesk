import type { DocPage, Param } from "./types";

const CONTACT = {
  id: 501,
  phone: "+9198XXXXXXXX",
  wa_id: "9198XXXXXXXX",
  name: "John Doe",
  profile_name: "John",
  email: "customer@example.com",
  tags: ["vip", "diwali-2026"],
  attributes: { city: "Your City", plan: "gold" },
  opted_out: false,
  blocked: false,
  source: "api",
  created_at: "2026-10-20T09:12:44Z",
  last_message_at: "2026-10-26T11:02:10Z",
};

const MESSAGE = {
  id: 9012,
  wamid: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQzA2RkY1",
  direction: "outbound",
  type: "text",
  text: "Your order #1042 has shipped!",
  status: "sent",
  to: "+9198XXXXXXXX",
  contact: { id: 501, phone: "+9198XXXXXXXX", name: "John Doe" },
  conversation_id: 301,
  template_name: null,
  media: null,
  reply_to_wamid: null,
  sent_by: "API (Website)",
  error: null,
  created_at: "2026-10-26T11:05:00Z",
  sent_at: "2026-10-26T11:05:01Z",
  delivered_at: null,
  read_at: null,
};

const ORDER = {
  id: 77,
  number: "#1042",
  status: "confirmed",
  payment_status: "paid",
  payment_method: "online",
  source: "whatsapp_cart",
  currency: "INR",
  subtotal: 998,
  discount: 0,
  shipping: 40,
  tax: 0,
  total: 1038,
  coupon_code: null,
  items: [{ name: "Kaju Katli 500 g", sku: "KK-500", quantity: 2, unit_price: 499 }],
  customer: { name: "John Doe", phone: "+9198XXXXXXXX" },
  address: {
    name: "John Doe",
    line1: "123 Sample Street",
    city: "Your City",
    state: "Your State",
    pincode: "XXXXXX",
  },
  tracking: null,
  created_at: "2026-10-26T10:40:00Z",
  confirmed_at: "2026-10-26T10:41:12Z",
};

const PHONE_PATH: Param = {
  name: "phone",
  type: "string",
  required: true,
  desc: "The contact's phone number with country code, digits only, e.g. `9198XXXXXXXX`.",
};

const MESSAGE_FIELDS: Param[] = [
  {
    name: "id",
    type: "integer",
    desc: "ChatDesk's id for the message. Use it with [GET /messages/{id}](/docs/api/get-message).",
  },
  { name: "wamid", type: "string", desc: "WhatsApp's own id for the message." },
  {
    name: "status",
    type: "string",
    desc: "`pending`, `sent`, `delivered`, `read`, `failed` (or `received` for incoming).",
  },
  {
    name: "error",
    type: "object | null",
    desc: "When `status` is `failed`: WhatsApp's error `code` and a `message`.",
  },
  { name: "conversation_id", type: "integer", desc: "The chat the message belongs to." },
];

export const API_PAGES: DocPage[] = [
  {
    slug: "api/me",
    title: "Check your API key",
    description: "Returns the WhatsApp number your key belongs to. A quick way to test a key.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/me",
          response: {
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
      },
      {
        t: "params",
        title: "Response fields",
        rows: [
          { name: "name", type: "string", desc: "The number's name in ChatDesk." },
          { name: "phone", type: "string", desc: "The WhatsApp number messages are sent from." },
          {
            name: "connected",
            type: "boolean",
            desc: "`false` means the number needs attention in **WhatsApp setup**: nothing can be sent until it's fixed.",
          },
        ],
      },
    ],
  },
  {
    slug: "api/send-message",
    title: "Send a text message",
    description: "Send a WhatsApp text message to a customer who wrote to you in the last 24 hours.",
    section: "api",
    method: "POST",
    blocks: [
      {
        t: "p",
        text: "Sends a text to a phone number. If the number isn't a contact yet, ChatDesk adds it. The message shows in your Team inbox, sent by “API (your key's name)”.",
      },
      {
        t: "callout",
        kind: "warning",
        title: "Only inside the 24-hour window",
        text: "Text, images and files can only go to someone who messaged you in the last 24 hours. Otherwise you get a `422` error: [send a template](/docs/api/send-template) instead.",
      },
      {
        t: "endpoint",
        spec: {
          method: "POST",
          path: "/messages",
          body: { to: "+9198XXXXXXXX", text: "Your order #1042 has shipped!" },
          status: 201,
          response: { status: true, message: "Message sent", data: MESSAGE },
        },
      },
      {
        t: "params",
        title: "Body",
        rows: [
          { name: "to", type: "string", required: true, desc: "Phone number with country code." },
          {
            name: "type",
            type: "string",
            desc: "`text` (the default). Other types: [template](/docs/api/send-template), [image, video, audio, document](/docs/api/send-media).",
          },
          {
            name: "text",
            type: "string",
            required: true,
            desc: "The message, up to 4,096 characters. WhatsApp formatting works: `*bold*`, `_italic_`, `~strike~`.",
          },
          { name: "name", type: "string", desc: "Saved as the contact's name if this number is new to you." },
          {
            name: "reply_to",
            type: "string",
            desc: "The `wamid` of a message to reply to (shown as a quote on the customer's phone).",
          },
        ],
      },
      { t: "params", title: "Response: the message", rows: MESSAGE_FIELDS },
      { t: "h2", text: "When WhatsApp refuses the message" },
      {
        t: "p",
        text: "If WhatsApp doesn't accept the message, you get status `422` with the message in `data`, its `status` set to `failed` and the reason in `error`:",
      },
      {
        t: "json",
        title: "Response",
        status: 422,
        value: {
          status: false,
          message: "Not sent: Message failed to send because more than 24 hours have passed",
          data: {
            ...MESSAGE,
            status: "failed",
            error: { code: 131047, message: "More than 24 hours have passed" },
          },
        },
      },
      {
        t: "callout",
        kind: "tip",
        text: "`sent` means WhatsApp accepted the message. Delivery and read receipts come later: watch them with the `message.delivered` and `message.read` [webhooks](/docs/webhooks/events), or check [GET /messages/{id}](/docs/api/get-message).",
      },
    ],
  },
  {
    slug: "api/send-template",
    title: "Send a template message",
    description:
      "Start a conversation, or message anyone outside the 24-hour window, with an approved template.",
    section: "api",
    method: "POST",
    blocks: [
      {
        t: "p",
        text: "Templates are message formats WhatsApp approved in advance, like “Hi {{1}}, your order {{2}} has shipped.” They can be sent at any time, so they're how you send order updates, reminders, OTPs and offers.",
      },
      {
        t: "steps",
        items: [
          {
            title: "Make the template",
            text: "Create it in ChatDesk under **Templates** and wait for WhatsApp to approve it (usually minutes).",
          },
          {
            title: "Find its variables",
            text: "Call [GET /templates](/docs/api/list-templates): `variables.body` lists what you must fill in, in order.",
          },
          { title: "Send it", text: "Send the values in `template.body`, in the same order." },
        ],
      },
      {
        t: "endpoint",
        spec: {
          method: "POST",
          path: "/messages",
          body: {
            to: "+9198XXXXXXXX",
            type: "template",
            template: { name: "order_update", language: "en", body: ["John", "#1042"] },
          },
          status: 201,
          response: {
            status: true,
            message: "Message sent",
            data: {
              ...MESSAGE,
              type: "template",
              template_name: "order_update",
              text: "Hi John, your order #1042 has shipped.",
            },
          },
        },
      },
      {
        t: "params",
        title: "Body",
        rows: [
          { name: "to", type: "string", required: true, desc: "Phone number with country code." },
          { name: "type", type: "string", required: true, desc: "`template`" },
          {
            name: "template.name",
            type: "string",
            required: true,
            desc: "The template's name, exactly as in ChatDesk.",
          },
          {
            name: "template.language",
            type: "string",
            desc: "Language code, e.g. `en`, `en_US`, `hi`. Default `en`.",
          },
          {
            name: "template.body",
            type: "string[]",
            desc: "Values for the body variables, in order: `{{1}}`, then `{{2}}`…",
          },
          {
            name: "template.header",
            type: "string[]",
            desc: "The value for a text header's variable, if it has one.",
          },
          {
            name: "template.header_media_url",
            type: "string",
            desc: "For an image, video or document header: a public link to the file. Leave it out to use the file saved with the template.",
          },
          {
            name: "template.buttons",
            type: "object[]",
            desc: 'For buttons that need a value: `{"index": 0, "text": "summer-sale"}` for a link button\'s variable part, or the code for a copy-code button.',
          },
          { name: "name", type: "string", desc: "Saved as the contact's name if this number is new to you." },
        ],
      },
      { t: "h2", text: "Examples" },
      {
        t: "json",
        title: "Template with an image header and a link button",
        value: {
          to: "+9198XXXXXXXX",
          type: "template",
          template: {
            name: "diwali_offer",
            language: "en",
            header_media_url: "https://yourshop.com/images/diwali.jpg",
            body: ["John", "20%"],
            buttons: [{ index: 0, text: "diwali" }],
          },
        },
      },
      {
        t: "json",
        title: "One-time password (authentication template)",
        value: {
          to: "+9198XXXXXXXX",
          type: "template",
          template: { name: "login_code", language: "en", body: ["482913"] },
        },
      },
      {
        t: "callout",
        kind: "info",
        text: "Contacts who opted out (replied STOP) can't be sent templates; you get a `422` error. This protects your number's quality rating.",
      },
    ],
  },
  {
    slug: "api/send-media",
    title: "Send an image, video, audio or file",
    description: "Send a file from a public link inside the 24-hour window.",
    section: "api",
    method: "POST",
    blocks: [
      {
        t: "p",
        text: "Give ChatDesk a public link to the file. We download it, upload it to WhatsApp and send it. Like text, files can only go to someone who messaged you in the last 24 hours.",
      },
      {
        t: "endpoint",
        spec: {
          method: "POST",
          path: "/messages",
          body: {
            to: "+9198XXXXXXXX",
            type: "document",
            media: {
              url: "https://yourshop.com/invoices/1042.pdf",
              caption: "Your invoice",
              filename: "Invoice-1042.pdf",
            },
          },
          status: 201,
          response: {
            status: true,
            message: "Message sent",
            data: {
              ...MESSAGE,
              type: "document",
              text: "Your invoice",
              media: { mime_type: "application/pdf", filename: "Invoice-1042.pdf", size: 48213 },
            },
          },
        },
      },
      {
        t: "params",
        title: "Body",
        rows: [
          { name: "to", type: "string", required: true, desc: "Phone number with country code." },
          { name: "type", type: "string", required: true, desc: "`image`, `video`, `audio` or `document`." },
          {
            name: "media.url",
            type: "string",
            required: true,
            desc: "A public `https://` link to the file. It must open without logging in.",
          },
          {
            name: "media.caption",
            type: "string",
            desc: "Text shown under an image, video or document (not audio).",
          },
          { name: "media.filename", type: "string", desc: "For documents: the file name the customer sees." },
        ],
      },
      {
        t: "table",
        head: ["Type", "Formats WhatsApp accepts", "Largest size"],
        rows: [
          ["`image`", "JPEG, PNG", "5 MB"],
          ["`video`", "MP4, 3GP", "16 MB"],
          ["`audio`", "AAC, MP4, MP3, AMR, OGG", "16 MB"],
          ["`document`", "Any file (PDF, Excel, Word…)", "100 MB"],
        ],
      },
      {
        t: "callout",
        kind: "tip",
        text: "Got a WebP image or a MOV video? Send it as `document`: WhatsApp doesn't accept those as images or videos.",
      },
    ],
  },
  {
    slug: "api/get-message",
    title: "Get a message",
    description: "Check a message's delivery status: sent, delivered, read or failed.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/messages/{id}",
          pathDefaults: { id: "9012" },
          response: {
            status: true,
            data: {
              ...MESSAGE,
              status: "read",
              delivered_at: "2026-10-26T11:05:03Z",
              read_at: "2026-10-26T11:07:40Z",
            },
          },
        },
      },
      {
        t: "params",
        title: "Path",
        rows: [
          { name: "id", type: "integer", required: true, desc: "The message `id` you got when you sent it." },
        ],
      },
      {
        t: "callout",
        kind: "tip",
        text: "Checking again and again (polling) works, but [webhooks](/docs/webhooks) tell you the moment the status changes, with no extra requests.",
      },
    ],
  },
  {
    slug: "api/list-contacts",
    title: "List contacts",
    description: "Search and page through your contacts.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/contacts",
          query: { search: "asha", per_page: "25" },
          response: {
            status: true,
            data: [CONTACT],
            meta: { page: 1, per_page: 25, total: 1, has_more: false },
          },
        },
      },
      {
        t: "params",
        title: "Query",
        rows: [
          { name: "search", type: "string", desc: "Part of a name, phone number or email." },
          { name: "tag", type: "string", desc: "Only contacts with this tag." },
          { name: "page", type: "integer", desc: "Page number, from 1." },
          { name: "per_page", type: "integer", desc: "How many per page, up to 100. Default 25." },
        ],
      },
      {
        t: "params",
        title: "Contact fields",
        rows: [
          { name: "phone", type: "string", desc: "With country code and +." },
          { name: "name", type: "string | null", desc: "The name you saved." },
          { name: "profile_name", type: "string | null", desc: "The name on the person's WhatsApp profile." },
          { name: "tags", type: "string[]", desc: "Labels like `vip`." },
          { name: "attributes", type: "object", desc: "Your own fields, like `city` or `plan`." },
          { name: "opted_out", type: "boolean", desc: "`true` if they asked not to get messages." },
          {
            name: "source",
            type: "string",
            desc: "Where they came from: `inbox`, `manual`, `import` or `api`.",
          },
        ],
      },
    ],
  },
  {
    slug: "api/upsert-contact",
    title: "Add or update a contact",
    description: "Adds a contact, or updates the one with the same phone number.",
    section: "api",
    method: "POST",
    blocks: [
      {
        t: "p",
        text: "Safe to call again and again: if the phone number is already a contact, only the fields you send are changed. You get `201` when a contact was added and `200` when one was updated.",
      },
      {
        t: "endpoint",
        spec: {
          method: "POST",
          path: "/contacts",
          body: {
            phone: "+9198XXXXXXXX",
            name: "John Doe",
            email: "customer@example.com",
            tags: ["vip"],
            attributes: { city: "Your City" },
          },
          status: 201,
          response: { status: true, message: "Contact added", data: CONTACT },
        },
      },
      {
        t: "params",
        title: "Body",
        rows: [
          { name: "phone", type: "string", required: true, desc: "Phone number with country code." },
          { name: "name", type: "string", desc: "Their name." },
          { name: "email", type: "string", desc: "Their email." },
          {
            name: "tags",
            type: "string[]",
            desc: "Replaces all their tags. To add or remove one tag, use [PATCH](/docs/api/update-contact).",
          },
          {
            name: "attributes",
            type: "object",
            desc: "Your own fields. Merged with the ones already saved. Names are made lowercase with `_` for spaces.",
          },
          { name: "opted_out", type: "boolean", desc: "`true` if they don't want messages." },
        ],
      },
    ],
  },
  {
    slug: "api/get-contact",
    title: "Get a contact",
    description: "Look up one contact by phone number.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/contacts/{phone}",
          pathDefaults: { phone: "9198XXXXXXXX" },
          response: { status: true, data: CONTACT },
        },
      },
      { t: "params", title: "Path", rows: [PHONE_PATH] },
      { t: "p", text: "Returns `404` if there's no contact with that number." },
    ],
  },
  {
    slug: "api/update-contact",
    title: "Update a contact",
    description: "Change a contact's details, add or remove tags, and set custom fields.",
    section: "api",
    method: "PATCH",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "PATCH",
          path: "/contacts/{phone}",
          pathDefaults: { phone: "9198XXXXXXXX" },
          body: {
            add_tags: ["paid-customer"],
            remove_tags: ["lead"],
            attributes: { plan: "gold", old_field: null },
          },
          response: { status: true, message: "Contact updated", data: CONTACT },
        },
      },
      { t: "params", title: "Path", rows: [PHONE_PATH] },
      {
        t: "params",
        title: "Body (send only what you want to change)",
        rows: [
          { name: "name", type: "string", desc: "Their name." },
          { name: "email", type: "string", desc: "Their email." },
          { name: "tags", type: "string[]", desc: "Replaces all tags." },
          { name: "add_tags", type: "string[]", desc: "Tags to add, keeping the others." },
          { name: "remove_tags", type: "string[]", desc: "Tags to remove." },
          { name: "attributes", type: "object", desc: "Fields to set. Send a field as `null` to delete it." },
          { name: "opted_out", type: "boolean", desc: "Mark them as not wanting messages (or back)." },
          { name: "blocked", type: "boolean", desc: "Blocked contacts can't be messaged." },
        ],
      },
    ],
  },
  {
    slug: "api/delete-contact",
    title: "Delete a contact",
    description: "Delete a contact and their whole chat history.",
    section: "api",
    method: "DELETE",
    blocks: [
      {
        t: "callout",
        kind: "danger",
        text: "This deletes the contact **and all their messages** in ChatDesk. It can't be undone.",
      },
      {
        t: "endpoint",
        spec: {
          method: "DELETE",
          path: "/contacts/{phone}",
          pathDefaults: { phone: "9198XXXXXXXX" },
          response: { status: true, message: "Contact and their chat deleted", data: null },
        },
      },
      { t: "params", title: "Path", rows: [PHONE_PATH] },
    ],
  },
  {
    slug: "api/list-conversations",
    title: "List conversations",
    description: "Your chats, newest first, with whether the 24-hour window is open.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/conversations",
          query: { status: "open" },
          response: {
            status: true,
            data: [
              {
                id: 301,
                status: "open",
                contact: CONTACT,
                unread_count: 2,
                last_message_at: "2026-10-26T11:02:10Z",
                last_message: "When will it arrive?",
                last_message_direction: "inbound",
                window_open: true,
                assignee: "Ravi",
                team: "Support",
              },
            ],
            meta: { page: 1, per_page: 25, total: 1, has_more: false },
          },
        },
      },
      {
        t: "params",
        title: "Query",
        rows: [
          { name: "status", type: "string", desc: "`open`, `pending` or `resolved`. Leave out for all." },
          { name: "page", type: "integer", desc: "Page number, from 1." },
          { name: "per_page", type: "integer", desc: "Up to 100. Default 25." },
        ],
      },
      {
        t: "params",
        title: "Useful fields",
        rows: [
          {
            name: "window_open",
            type: "boolean",
            desc: "`true`: you can send text and files now. `false`: send a template.",
          },
          { name: "assignee", type: "string | null", desc: "The team member handling the chat." },
        ],
      },
    ],
  },
  {
    slug: "api/conversation-messages",
    title: "Get a chat's messages",
    description: "Read the messages with one contact, oldest to newest.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/conversations/{phone}/messages",
          pathDefaults: { phone: "9198XXXXXXXX" },
          query: { limit: "25" },
          response: {
            status: true,
            data: [
              {
                ...MESSAGE,
                id: 9010,
                direction: "inbound",
                status: "received",
                text: "Hi, where is my order?",
                to: undefined,
                from: "+9198XXXXXXXX",
                sent_by: null,
              },
              MESSAGE,
            ],
            meta: { has_more: true, next_before: 9010 },
          },
        },
      },
      { t: "params", title: "Path", rows: [PHONE_PATH] },
      {
        t: "params",
        title: "Query",
        rows: [
          { name: "limit", type: "integer", desc: "How many messages, up to 100. Default 25." },
          {
            name: "before",
            type: "integer",
            desc: "For older messages: pass `meta.next_before` from the previous response.",
          },
        ],
      },
      {
        t: "p",
        text: "Incoming messages have `from`; messages you sent have `to`. Button and list replies include `reply` with the `id` and `title` of what the customer tapped.",
      },
    ],
  },
  {
    slug: "api/list-templates",
    title: "List templates",
    description: "Your WhatsApp templates and the variables each one needs.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/templates",
          query: { status: "approved" },
          response: {
            status: true,
            data: [
              {
                id: 14,
                name: "order_update",
                language: "en",
                category: "utility",
                status: "approved",
                header: null,
                body: "Hi {{1}}, your order {{2}} has shipped.",
                footer: "Thank you for shopping with us",
                buttons: [{ index: 0, type: "url", text: "Track order" }],
                variables: { header: [], body: ["1", "2"], buttons: [{ index: 0, type: "url" }] },
              },
            ],
          },
        },
      },
      {
        t: "params",
        title: "Query",
        rows: [
          { name: "status", type: "string", desc: "`approved` (default), `pending`, `rejected` or `all`." },
        ],
      },
      {
        t: "p",
        text: "`variables` tells you exactly what to send: `variables.body` has one entry per value needed in `template.body`, and `variables.buttons` lists the buttons that need a value in `template.buttons`.",
      },
    ],
  },
  {
    slug: "api/list-orders",
    title: "List orders",
    description: "Orders placed through WhatsApp, your chatbots, your store or by your team.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/orders",
          query: { status: "confirmed" },
          response: {
            status: true,
            data: [ORDER],
            meta: { page: 1, per_page: 25, total: 1, has_more: false },
          },
        },
      },
      {
        t: "params",
        title: "Query",
        rows: [
          {
            name: "status",
            type: "string",
            desc: "`awaiting_address`, `awaiting_payment`, `confirmed`, `packed`, `shipped`, `delivered` or `cancelled`.",
          },
          { name: "page", type: "integer", desc: "Page number, from 1." },
          { name: "per_page", type: "integer", desc: "Up to 100. Default 25." },
        ],
      },
      {
        t: "params",
        title: "Order fields",
        rows: [
          { name: "number", type: "string", desc: "The order number customers see, e.g. `#1042`." },
          {
            name: "payment_status",
            type: "string",
            desc: "`unpaid`, `paid`, `partially_refunded` or `refunded`.",
          },
          { name: "payment_method", type: "string | null", desc: "`online` or `cod` (cash on delivery)." },
          { name: "total", type: "number", desc: "In normal units of `currency` (₹1038 is `1038`)." },
          {
            name: "source",
            type: "string",
            desc: "`whatsapp_cart`, `buy_button`, `chatbot`, `manual`, `shopify` or `woocommerce`.",
          },
        ],
      },
    ],
  },
  {
    slug: "api/get-order",
    title: "Get an order",
    description: "One order with its items, address and tracking.",
    section: "api",
    method: "GET",
    blocks: [
      {
        t: "endpoint",
        spec: {
          method: "GET",
          path: "/orders/{id}",
          pathDefaults: { id: "77" },
          response: { status: true, data: ORDER },
        },
      },
      {
        t: "params",
        title: "Path",
        rows: [{ name: "id", type: "integer", required: true, desc: "The order's `id` (not its number)." }],
      },
    ],
  },
];
