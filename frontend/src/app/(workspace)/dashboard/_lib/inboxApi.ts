import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

import type { Template } from "./templatesApi";

export type ConversationStatus = "open" | "pending" | "resolved";
export type MessageStatus = "received" | "pending" | "sent" | "delivered" | "read" | "failed";

export interface InboxContact {
  id: number;
  wa_id: string;
  phone: string;
  name: string | null;
  profile_name: string | null;
  display_name: string;
  tags: string[];
  opted_out: boolean;
  blocked: boolean;
  created_at: string;
  last_message_at: string | null;
}

export interface Conversation {
  id: number;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  last_message_type: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  window_open: boolean;
  resolved_at: string | null;
  created_at: string;
  contact: InboxContact;
  /** Team: who handles the chat and its team */
  assignee: { id: number; name: string } | null;
  team: { id: number; name: string } | null;
  assigned_at: string | null;
  /** oldest customer message nobody has answered yet */
  waiting_since: string | null;
  /** name of the chatbot talking in the chat right now */
  bot?: string | null;
  /** details of that chatbot (single chat responses only) */
  bot_session?: { id: number; chatbot_id: number; name: string; wait: string | null; node: string } | null;
  /** other team members in this chat right now (list responses only) */
  presence?: Presence[];
  /** snoozed until this time (only while it's snoozed) */
  snoozed_until: string | null;
  snooze_note: string | null;
  /** stays snoozed even if the customer writes */
  snooze_keep: boolean;
  /** the snooze ended and nobody has handled the chat yet */
  snooze_woke_at: string | null;
  /** pinned to the top: for the signed-in person, or for everyone */
  pin: "me" | "everyone" | null;
  /** where a search found its words in this chat (search results only) */
  match?: SearchMatch | null;
}

export interface SearchMatch {
  count: number;
  /** the newest matching message, to jump to (empty when only a note matched) */
  message_id: number | null;
  snippet: string;
  direction: "in" | "out" | null;
  in_note: boolean;
  created_at: string | null;
}

/** The filter panel. Every key is optional; they combine with AND. */
export interface InboxFilters {
  /** unanswered for at least this many minutes */
  waiting?: number;
  attachment?: "any" | "image" | "document" | "audio" | "video" | "location";
  date_from?: string;
  date_to?: string;
  window?: "open" | "closed";
  starred?: boolean;
  tag?: string;
}

export interface SavedView {
  id: number;
  name: string;
  params: Record<string, string | number | boolean>;
  shared: boolean;
  mine: boolean;
}

export interface MessageStar {
  id: number;
  note: string | null;
  created_at: string;
  by: { id: number; name: string } | null;
}

/** A starred message, from the Starred list across chats. */
export interface StarredItem extends MessageStar {
  message: {
    id: number;
    type: string;
    direction: "in" | "out";
    text: string | null;
    media_filename: string | null;
    created_at: string;
  };
  conversation: { id: number; contact: string };
}

export type BulkAction = "pin" | "pin_everyone" | "unpin" | "snooze" | "wake" | "resolve" | "read";

/** A team member who has a chat open: just looking, typing a reply, or writing a note. */
export interface Presence {
  id: number;
  name: string;
  state: "viewing" | "reply" | "note";
  at: string;
}

/** The newest reply a colleague typed into the chat (not bots, campaigns or automatic messages). */
export interface ColleagueReply {
  id: number;
  by: { id: number; name: string };
  preview: string;
  created_at: string | null;
}

export interface PresenceInfo {
  others: Presence[];
  last_colleague_reply: ColleagueReply | null;
}

/** Something that happened to a chat, shown in its timeline (assigned, resolved…). */
export interface ConversationEvent {
  id: number;
  kind: "assigned" | "unassigned" | "team" | "status" | "bot" | "ai" | "snooze" | "pin";
  text: string;
  actor: string | null;
  created_at: string;
}

export interface InboxMessage {
  id: number;
  wamid: string | null;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: MessageStatus;
  error: string | null;
  error_code: number | null;
  template_name: string | null;
  sent_by: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  media: {
    path: string;
    mime: string | null;
    filename: string | null;
    size: number | null;
    voice: boolean;
  } | null;
  location: { latitude: number; longitude: number; name: string | null; address: string | null } | null;
  reaction_to: string | null;
  /** starred for the team */
  star?: MessageStar | null;
  reply_to: { id: number; text: string | null; type: string; direction: "in" | "out" } | null;
  /** Template messages: the header kind and the buttons, to draw them like WhatsApp does */
  template: { header_format: string | null; buttons: { type: string; text: string }[] } | null;
  /** The order a shop message (or an incoming cart) belongs to */
  order?: { id: number; ref: string } | null;
  /** An incoming WhatsApp cart */
  cart?: {
    items: { retailer_id: string; quantity: number; price: number | null; currency: string | null }[];
    text: string | null;
  } | null;
  /** Products sent from Commerce: what the customer received */
  commerce?: {
    kind: "product" | "products" | "catalog" | "card";
    header?: string | null;
    body?: string | null;
    footer?: string | null;
    products: { id: number; name: string; price_text: string; image_url: string | null }[];
  } | null;
}

export interface InboxSummary {
  all: number;
  open: number;
  pending: number;
  resolved: number;
  unread: number;
  mine: number;
  unassigned: number;
  snoozed: number;
  role: "owner" | "admin" | "agent" | "viewer";
}

export interface InboxNote {
  id: number;
  body: string;
  author: string | null;
  member_id: number | null;
  created_at: string;
  edited_at: string | null;
  /** the signed-in person wrote it, or is an admin */
  can_edit: boolean;
}

export interface QuickReply {
  id: number;
  shortcut: string;
  text: string;
  updated_at: string | null;
}

export type { Template as MessageTemplate } from "./templatesApi";

export interface SendTemplateInput {
  name: string;
  language: string;
  body_params: { text: string }[];
  header_params: { text: string }[];
  button_params: { index: number; text: string }[];
  /** A file uploaded for this send instead of the template's own sample */
  header_media?: string | null;
  location?: { latitude: number; longitude: number; name?: string; address?: string } | null;
}

export interface Page<T> {
  data: T[];
  meta?: { page: number; per_page: number; total: number; total_pages: number };
}

const I = CUSTOMER_ENDPOINTS.INBOX;

/** Same envelope as `request`, but keeps `meta` (and the extra conversation on message lists). */
async function getFull<T>(path: string) {
  const res = await fetch(`${BROWSER_API_BASE_URL}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "sk-web" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new CustomerApiError(json.message ?? "Something went wrong.", res.status);
  return json as T;
}

export const mediaUrl = (path: string) => `${BROWSER_API_BASE_URL}${path}`;
export const downloadUrl = (path: string) => `${mediaUrl(path)}?download=1`;

export const inboxApi = {
  summary: () => request<InboxSummary>("GET", I.SUMMARY),
  conversations: (params: QueryParams) => getFull<Page<Conversation>>(withQuery(I.CONVERSATIONS, params)),
  conversation: (id: number) => request<Conversation>("GET", I.CONVERSATION(id)),
  start: (body: { phone: string; name?: string }) => request<Conversation>("POST", I.CONVERSATIONS, body),
  assign: (id: number, body: { assignee_id: number | null; team_id: number | null }) =>
    request<Conversation>("PUT", I.ASSIGN(id), body),
  setStatus: (id: number, status: ConversationStatus) =>
    request<Conversation>("PUT", I.STATUS(id), { status }),
  markRead: (id: number) => request<Conversation>("POST", I.READ(id)),
  messages: (id: number, params: { before?: number; after?: number; limit?: number } = {}) =>
    getFull<{
      data: InboxMessage[];
      meta: { has_more: boolean };
      conversation: Conversation;
      events: ConversationEvent[];
      notes: InboxNote[];
    }>(withQuery(I.MESSAGES(id), params)),
  /** `seen_message_id`: the newest message seen when typing started. A 409 with `data.conflict` (a
   * ColleagueReply) means a colleague answered since; send again with `force` to send anyway. */
  sendText: (
    id: number,
    text: string,
    opts: { reply_to_id?: number; seen_message_id?: number; force?: boolean } = {}
  ) => request<InboxMessage>("POST", I.MESSAGES(id), { text, ...opts }),
  sendTemplate: (id: number, body: SendTemplateInput) => request<InboxMessage>("POST", I.TEMPLATE(id), body),
  async sendMedia(id: number, file: File, caption?: string) {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    const res = await fetch(`${BROWSER_API_BASE_URL}${I.MEDIA_UPLOAD(id)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-Requested-With": "sk-web" },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const first = Object.values((json.errors ?? {}) as Record<string, string[]>)[0]?.[0];
      throw new CustomerApiError(first ?? json.message ?? "Couldn't send the file.", res.status);
    }
    return { message: json.message as string | undefined, data: json.data as InboxMessage };
  },
  updateContact: (
    id: number,
    body: { name?: string | null; tags?: string[]; opted_out?: boolean; blocked?: boolean }
  ) => request<Conversation>("PUT", I.CONTACT(id), body),
  notes: (id: number) => request<InboxNote[]>("GET", I.NOTES(id)),
  addNote: (id: number, body: string) => request<InboxNote>("POST", I.NOTES(id), { body }),
  updateNote: (id: number, noteId: number, body: string) =>
    request<InboxNote>("PUT", I.NOTE(id, noteId), { body }),
  deleteNote: (id: number, noteId: number) => request<null>("DELETE", I.NOTE(id, noteId)),
  /** "I'm in this chat" (every few seconds while it's open); "left" when it closes. */
  presence: (id: number, state: "viewing" | "reply" | "note" | "left") =>
    request<PresenceInfo | null>("POST", I.PRESENCE(id), { state }),
  retry: (messageId: number) => request<InboxMessage>("POST", I.RETRY(messageId)),
  typing: (id: number) => request<null>("POST", I.TYPING(id)),
  snooze: (id: number, body: { until: string; note?: string | null; keep?: boolean }) =>
    request<Conversation>("PUT", I.SNOOZE(id), body),
  /** wake a snoozed chat now, or dismiss its "came back" marker */
  wake: (id: number) => request<Conversation>("DELETE", I.SNOOZE(id)),
  pin: (id: number, scope: "me" | "everyone") => request<Conversation>("POST", I.PIN(id), { scope }),
  unpin: (id: number, scope?: "me" | "everyone") =>
    request<Conversation>("DELETE", withQuery(I.PIN(id), { scope })),
  star: (messageId: number, note?: string | null) =>
    request<InboxMessage>("PUT", I.STAR(messageId), { note: note ?? null }),
  unstar: (messageId: number) => request<InboxMessage>("DELETE", I.STAR(messageId)),
  stars: (params: { conversation_id?: number; mine?: boolean; search?: string; before?: number }) =>
    getFull<{ data: StarredItem[]; meta: { has_more: boolean } }>(withQuery(I.STARS, params)),
  searchIn: (id: number, q: string) =>
    request<{ ids: number[]; count: number; words: string[] }>("GET", withQuery(I.SEARCH_IN(id), { q })),
  views: () => request<SavedView[]>("GET", I.VIEWS),
  saveView: (body: { name: string; params: Record<string, unknown>; shared: boolean }) =>
    request<SavedView>("POST", I.VIEWS, body),
  deleteView: (id: number) => request<null>("DELETE", I.VIEW(id)),
  bulk: (body: { ids: number[]; action: BulkAction; until?: string; note?: string | null }) =>
    request<{ done: number; skipped: number }>("POST", I.BULK, body),
  quickReplies: () => request<QuickReply[]>("GET", I.QUICK_REPLIES),
  saveQuickReply: (body: { shortcut: string; text: string }, id?: number) =>
    id
      ? request<QuickReply>("PUT", I.QUICK_REPLY(id), body)
      : request<QuickReply>("POST", I.QUICK_REPLIES, body),
  deleteQuickReply: (id: number) => request<null>("DELETE", I.QUICK_REPLY(id)),
  templates: (fresh = false) =>
    request<Template[]>("GET", withQuery(I.TEMPLATES, { fresh: fresh || undefined })),
  tags: () => request<string[]>("GET", I.TAGS),
};

export const INBOX_QK = {
  ALL: ["inbox"] as const,
  SUMMARY: ["inbox", "summary"] as const,
  LIST: (params: QueryParams) => ["inbox", "list", params] as const,
  MESSAGES: (id: number) => ["inbox", "messages", id] as const,
  NOTES: (id: number) => ["inbox", "notes", id] as const,
  TEMPLATES: ["inbox", "templates"] as const,
  TAGS: ["inbox", "tags"] as const,
  QUICK_REPLIES: ["inbox", "quick-replies"] as const,
  STARS: (params: QueryParams) => ["inbox", "stars", params] as const,
  VIEWS: ["inbox", "views"] as const,
};
