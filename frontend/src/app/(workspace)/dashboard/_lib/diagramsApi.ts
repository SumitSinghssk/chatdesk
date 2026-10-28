import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

export type Level = "view" | "comment" | "edit" | "manage";
export type TeamAccess = "edit" | "comment" | "view" | "private";

/** A shape as saved (React Flow's node, minus what only the screen needs). */
export interface DiagramNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string;
  zIndex?: number;
  data: Record<string, unknown>;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: Record<string, unknown>;
}

export interface DiagramContent {
  nodes: Record<string, DiagramNode>;
  edges: Record<string, DiagramEdge>;
}

export interface Person {
  id: number | null;
  name: string;
  color: string;
  guest: boolean;
}

export interface DiagramSummary {
  id: number;
  name: string;
  folder: string | null;
  level: Level;
  starred: boolean;
  team_access: TeamAccess;
  shared: boolean;
  shapes: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  preview: {
    nodes: {
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      shape: string | null;
      fill: string | null;
      parent: string | null;
    }[];
    edges: [string, string][];
  };
}

/** The live part that isn't drawing: a workshop timer, dot voting, and approval. */
export type RecordType = "contact" | "order" | "campaign" | "chatbot";

/** What a live card shows (people outside the team get fewer details, and no `path`). */
export interface RecordCard {
  type: RecordType;
  id: number;
  missing?: boolean;
  title?: string;
  status?: string | null;
  /** where it opens in ChatDesk (team members) */
  path?: string;
  /** the WhatsApp number it's on, when the workspace has several */
  number?: string;
  phone?: string;
  tags?: string[];
  preview?: string | null;
  last_message_at?: string | null;
  total?: string;
  payment_status?: string;
  items?: number;
  customer?: string | null;
  report?: {
    recipients: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
  };
  chats_week?: number;
  keywords?: string[];
}

/** What the AI drew: shapes with labels, and the lines between them (the browser lays it out). */
export interface AiGraph {
  title: string;
  kind: "flowchart" | "mindmap";
  nodes: { id: string; label: string; shape: string }[];
  edges: { from: string; to: string; label: string }[];
}

export interface AiSuggestion {
  label: string;
  /** the shape it follows */
  after: string | null;
  why: string;
}

export interface AiOption {
  id: number;
  label: string;
  provider: string;
  model: string;
  models: string[];
}

export interface RecordHit {
  id: number;
  title: string;
  subtitle: string;
}

export interface Page {
  id: string;
  name: string;
}

export interface LiveState {
  /** in order; none yet means one page */
  pages?: Page[];
  session: {
    /** `left`: seconds to go when this was sent (devices count down from when they get it) */
    timer: { minutes: number; ends_at: string; by: string; left?: number } | null;
    voting: { open: boolean; per_person: number; votes: Record<string, string[]> };
  };
  /** the server's clock when this was sent (timers count down by it, not the device's clock) */
  now: string;
  locked: boolean;
  approval: { approved_at: string | null; approved_by: string | null; version_id: number | null } | null;
}

export interface SinceApproval {
  approved_at: string;
  approved_by: string;
  added: string[];
  removed: string[];
  changed: string[];
  lines_added: number;
  lines_removed: number;
  lines_changed: number;
}

export interface ShareLink {
  enabled: boolean;
  access: "view" | "comment";
  token: string | null;
  has_password: boolean;
  expires_at: string | null;
}

export interface Diagram extends LiveState {
  id: number;
  name: string;
  folder: string | null;
  content: DiagramContent;
  seq: number;
  level: Level;
  team_access: TeamAccess;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  starred: boolean;
  me: Person;
  /** only for people who manage it */
  link?: ShareLink;
  /** shown on another website in a frame (view only) */
  embed?: { enabled: boolean; token: string | null };
  members?: { member_id: number; role: "edit" | "comment" | "view" }[];
}

export interface TeamPerson {
  id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "agent";
  color: string;
}

export interface Op {
  k: "n" | "e";
  id: string;
  v: DiagramNode | DiagramEdge | null;
}

export interface CatchUp {
  seq: number;
  batches?: { seq: number; client: string | null; actor: string | null; ops: Op[] }[];
  reload?: boolean;
  content?: DiagramContent;
  gone?: boolean;
}

export interface Comment {
  id: number;
  parent_id: number | null;
  node_id: string | null;
  /** the page a pin on the canvas is on (none: the first) */
  page?: string | null;
  x: number | null;
  y: number | null;
  body: string;
  author: string;
  author_id: number | null;
  guest: boolean;
  color: string;
  resolved: boolean;
  created_at: string;
  mentions: { id: number; name: string }[];
  /** a comment someone has to act on (resolving the thread marks it done) */
  task?: { assignee_id: number | null; assignee: string; due_on: string | null; by: string | null } | null;
}

export interface Task extends Comment {
  diagram: { id: number; name: string };
  overdue: boolean;
}

export interface Version {
  id: number;
  name: string | null;
  created_by: string | null;
  created_at: string;
  shapes: number;
}

export interface Activity {
  id: number;
  kind:
    | "created"
    | "edited"
    | "commented"
    | "shared"
    | "restored"
    | "viewed"
    | "approved"
    | "unlocked"
    | "change_requested";
  actor: string | null;
  guest: boolean;
  detail: string | null;
  at: string;
}

export interface CommentInput {
  body: string;
  node_id?: string | null;
  page?: string | null;
  x?: number | null;
  y?: number | null;
  parent_id?: number | null;
  mentions?: number[];
}

const D = CUSTOMER_ENDPOINTS.DIAGRAMS;

export const diagramsApi = {
  list: (params: { search?: string; folder?: string; starred?: boolean }) =>
    request<DiagramSummary[]>("GET", withQuery(D.LIST, params)) as Promise<{
      data: DiagramSummary[];
      folders?: string[];
      message?: string;
    }>,
  create: (body: { name: string; folder?: string | null; content?: DiagramContent }) =>
    request<Diagram>("POST", D.LIST, body),
  get: (id: number) => request<Diagram>("GET", D.ONE(id)),
  update: (id: number, body: { name?: string; folder?: string | null; pages?: Page[] }) =>
    request<Diagram>("PUT", D.ONE(id), body),
  remove: (id: number) => request<null>("DELETE", D.ONE(id)),
  duplicate: (id: number) => request<Diagram>("POST", D.DUPLICATE(id)),
  star: (id: number, on: boolean) => request<{ starred: boolean }>("POST", withQuery(D.STAR(id), { on })),
  team: () => request<TeamPerson[]>("GET", D.TEAM),
  saveOps: (id: number, ops: Op[], clientId: string) =>
    request<{ seq: number; ops: Op[] }>("POST", D.OPS(id), { ops, client_id: clientId }),
  changes: (id: number, since: number) => request<CatchUp>("GET", withQuery(D.OPS(id), { since })),
  setAccess: (id: number, body: { team_access: TeamAccess; members: Diagram["members"] }) =>
    request<Diagram>("PUT", D.ACCESS(id), body),
  setLink: (
    id: number,
    body: {
      enabled: boolean;
      access: "view" | "comment";
      password?: string | null;
      expires_at?: string | null;
      new_link?: boolean;
    }
  ) => request<Diagram>("PUT", D.LINK(id), body),
  records: (id: number) => request<Record<string, RecordCard>>("GET", D.RECORDS(id)),
  aiOptions: () => request<AiOption[]>("GET", D.AI),
  aiDraw: (body: { prompt: string; kind: "any" | "flowchart" | "mindmap" }) =>
    request<AiGraph>("POST", D.AI_DRAW, body),
  aiSummary: (id: number) => request<{ text: string }>("POST", D.AI_SUMMARY(id)),
  aiSuggest: (id: number) => request<AiSuggestion[]>("POST", D.AI_SUGGEST(id)),
  findRecords: (type: RecordType, q: string) =>
    request<RecordHit[]>("GET", withQuery(D.FIND_RECORDS, { type, q: q || undefined })),
  setEmbed: (id: number, body: { enabled: boolean; new_code?: boolean }) =>
    request<Diagram>("PUT", D.EMBED(id), body),
  activity: (id: number) => request<Activity[]>("GET", D.ACTIVITY(id)),
  versions: (id: number) => request<Version[]>("GET", D.VERSIONS(id)),
  version: (id: number, versionId: number) =>
    request<{
      id: number;
      name: string | null;
      content: DiagramContent;
      created_at: string;
      created_by: string | null;
    }>("GET", D.VERSION(id, versionId)),
  timer: (id: number, minutes: number) => request<LiveState>("POST", D.TIMER(id), { minutes }),
  voting: (id: number, body: { open: boolean; per_person?: number; reset?: boolean }) =>
    request<LiveState>("PUT", D.VOTING(id), body),
  vote: (id: number, nodeId: string, on: boolean) =>
    request<LiveState>("POST", D.VOTES(id), { node_id: nodeId, on }),
  approve: (id: number) => request<Diagram>("POST", D.APPROVE(id)),
  unlock: (id: number) => request<Diagram>("POST", D.UNLOCK(id)),
  requestChange: (id: number, note: string) => request<null>("POST", D.REQUEST_CHANGE(id), { note }),
  sinceApproval: (id: number) => request<SinceApproval | null>("GET", D.SINCE_APPROVAL(id)),
  /** stores a picture for an image shape; returns its address */
  async uploadImage(id: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
      res = await fetch(`${BROWSER_API_BASE_URL}${D.IMAGES(id)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-Requested-With": "sk-web" },
        body: form,
      });
    } catch {
      throw new CustomerApiError("Can't reach the server. Please try again in a moment.", 0);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new CustomerApiError(json.message ?? "The picture couldn't be uploaded", res.status);
    return (json.data as { url: string }).url;
  },
  saveVersion: (id: number, name: string) => request<null>("POST", D.VERSIONS(id), { name }),
  restore: (id: number, versionId: number) => request<Diagram>("POST", D.RESTORE(id, versionId)),
  comments: (id: number) => request<Comment[]>("GET", D.COMMENTS(id)),
  comment: (id: number, body: CommentInput) => request<Comment>("POST", D.COMMENTS(id), body),
  resolve: (id: number, commentId: number, resolved: boolean) =>
    request<Comment>("PUT", D.COMMENT(id, commentId), { resolved }),
  removeComment: (id: number, commentId: number) => request<null>("DELETE", D.COMMENT(id, commentId)),
  setTask: (id: number, commentId: number, body: { assignee_id: number | null; due_on?: string | null }) =>
    request<Comment>("PUT", D.TASK(id, commentId), body),
  tasks: (done = false) => request<Task[]>("GET", `${D.TASKS}${done ? "?done=true" : ""}`),
  /** the live connection's address (the API sits behind this site, so it's the same host) */
  liveUrl: (id: number, since: number | null) =>
    socketUrl(withQuery(D.LIVE(id), { since: since ?? undefined })),
};

/** ws(s)://this-site/api/v1/... */
export function socketUrl(path: string) {
  const base = BROWSER_API_BASE_URL.startsWith("http")
    ? BROWSER_API_BASE_URL
    : `${window.location.origin}${BROWSER_API_BASE_URL}`;
  return `${base.replace(/^http/, "ws")}${path}`;
}

// People outside the workspace, through a share link ----------------------------------------------

const S = CUSTOMER_ENDPOINTS.SHARED_DIAGRAMS;

export interface SharedDiagram extends LiveState {
  name: string;
  content: DiagramContent;
  seq: number;
  access: "view" | "comment";
  updated_at: string;
  comments: Comment[];
}

async function guest<T>(method: "GET" | "POST", path: string, pass: string | null, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${BROWSER_API_BASE_URL}${path}`, {
      method,
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "sk-web",
        ...(pass ? { "X-Diagram-Pass": pass } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CustomerApiError("Can't reach the server. Please try again in a moment.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Object.fromEntries(
      Object.entries((json.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0] ?? ""])
    );
    throw new CustomerApiError(json.message ?? "Something went wrong. Please try again.", res.status, errors);
  }
  return json as { status: boolean; message?: string; data: T };
}

export const sharedApi = {
  get: (token: string, pass: string | null) => guest<SharedDiagram>("GET", S.ONE(token), pass),
  unlock: (token: string, password: string) =>
    guest<{ pass: string | null }>("POST", S.UNLOCK(token), null, { password }),
  changes: (token: string, pass: string | null, since: number) =>
    guest<CatchUp>("GET", withQuery(S.OPS(token), { since }), pass),
  comments: (token: string, pass: string | null) => guest<Comment[]>("GET", S.COMMENTS(token), pass),
  records: (token: string, pass: string | null) =>
    guest<Record<string, RecordCard>>("GET", S.RECORDS(token), pass),
  comment: (token: string, pass: string | null, body: CommentInput & { name: string }) =>
    guest<Comment>("POST", S.COMMENTS(token), pass, body),
  liveUrl: (token: string, since: number | null, pass: string | null, name: string | null) =>
    socketUrl(
      withQuery(S.LIVE(token), { since: since ?? undefined, key: pass ?? undefined, name: name ?? undefined })
    ),
};

// Shown on another website (view only) ------------------------------------------------------------

export interface EmbeddedDiagram {
  name: string;
  content: DiagramContent;
  seq: number;
  pages: Page[];
  updated_at: string;
}

export const embedApi = {
  get: (token: string) => guest<EmbeddedDiagram>("GET", S.EMBED(token), null),
  records: (token: string) => guest<Record<string, RecordCard>>("GET", S.EMBED_RECORDS(token), null),
  changes: (token: string, since: number) =>
    guest<CatchUp & { pages: Page[] }>("GET", withQuery(S.EMBED_OPS(token), { since }), null),
};

export const DIAGRAMS_QK = {
  ALL: ["diagrams"] as const,
  LIST: (params: Record<string, unknown>) => ["diagrams", "list", params] as const,
  ONE: (id: number) => ["diagrams", "one", id] as const,
  TEAM: ["diagrams", "team"] as const,
  TASKS: (done: boolean) => ["diagrams", "tasks", done] as const,
  COMMENTS: (id: number) => ["diagrams", "comments", id] as const,
  VERSIONS: (id: number) => ["diagrams", "versions", id] as const,
  ACTIVITY: (id: number) => ["diagrams", "activity", id] as const,
};
