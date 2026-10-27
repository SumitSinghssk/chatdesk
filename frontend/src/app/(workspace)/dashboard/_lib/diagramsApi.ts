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

export interface ShareLink {
  enabled: boolean;
  access: "view" | "comment";
  token: string | null;
  has_password: boolean;
  expires_at: string | null;
}

export interface Diagram {
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
  x: number | null;
  y: number | null;
  body: string;
  author: string;
  author_id: number | null;
  guest: boolean;
  color: string;
  resolved: boolean;
  created_at: string;
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
  kind: "created" | "edited" | "commented" | "shared" | "restored" | "viewed";
  actor: string | null;
  guest: boolean;
  detail: string | null;
  at: string;
}

export interface CommentInput {
  body: string;
  node_id?: string | null;
  x?: number | null;
  y?: number | null;
  parent_id?: number | null;
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
  update: (id: number, body: { name?: string; folder?: string | null }) =>
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
  saveVersion: (id: number, name: string) => request<null>("POST", D.VERSIONS(id), { name }),
  restore: (id: number, versionId: number) => request<Diagram>("POST", D.RESTORE(id, versionId)),
  comments: (id: number) => request<Comment[]>("GET", D.COMMENTS(id)),
  comment: (id: number, body: CommentInput) => request<Comment>("POST", D.COMMENTS(id), body),
  resolve: (id: number, commentId: number, resolved: boolean) =>
    request<Comment>("PUT", D.COMMENT(id, commentId), { resolved }),
  removeComment: (id: number, commentId: number) => request<null>("DELETE", D.COMMENT(id, commentId)),
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

export interface SharedDiagram {
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
  comment: (token: string, pass: string | null, body: CommentInput & { name: string }) =>
    guest<Comment>("POST", S.COMMENTS(token), pass, body),
  liveUrl: (token: string, since: number | null, pass: string | null, name: string | null) =>
    socketUrl(
      withQuery(S.LIVE(token), { since: since ?? undefined, key: pass ?? undefined, name: name ?? undefined })
    ),
};

export const DIAGRAMS_QK = {
  ALL: ["diagrams"] as const,
  LIST: (params: Record<string, unknown>) => ["diagrams", "list", params] as const,
  ONE: (id: number) => ["diagrams", "one", id] as const,
  TEAM: ["diagrams", "team"] as const,
  COMMENTS: (id: number) => ["diagrams", "comments", id] as const,
  VERSIONS: (id: number) => ["diagrams", "versions", id] as const,
  ACTIVITY: (id: number) => ["diagrams", "activity", id] as const,
};
