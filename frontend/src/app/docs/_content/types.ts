// The docs are written as data (blocks), not free HTML, so every page looks the same, search can read
// every word, and code samples for each endpoint are generated in four languages from one spec.

export type Method = "GET" | "POST" | "PATCH" | "DELETE";
export type Section = "start" | "api" | "webhooks" | "guides" | "help";

export interface Param {
  name: string;
  type: string;
  required?: boolean;
  /** plain sentence; `code`, **bold** and [links](/docs/x) work */
  desc: string;
}

export interface EndpointSpec {
  method: Method;
  /** e.g. /contacts/{phone} */
  path: string;
  /** what the Try it panel fills in for {path} params */
  pathDefaults?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  response: unknown;
  status?: number;
}

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; text: string; id?: string }
  | { t: "h3"; text: string; id?: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  | { t: "callout"; kind: "info" | "tip" | "warning" | "danger"; title?: string; text: string }
  | { t: "steps"; items: { title: string; text: string; image?: Shot }[] }
  | { t: "image"; shot: Shot }
  | { t: "code"; lang: string; code: string; title?: string }
  | { t: "codetabs"; samples: { label: string; lang: string; code: string }[] }
  | { t: "endpoint"; spec: EndpointSpec }
  | { t: "params"; title: string; rows: Param[] }
  | { t: "json"; title: string; value: unknown; status?: number }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "cards"; items: { title: string; text: string; href: string; icon: string }[] }
  | { t: "events" };

export interface Shot {
  src: string;
  alt: string;
  caption?: string;
  /** natural size, so the page doesn't jump while it loads */
  width: number;
  height: number;
}

export interface DocPage {
  slug: string; // "" for the home page, "api/send-message", ...
  title: string;
  description: string;
  section: Section;
  /** for API pages: shown in the sidebar and search */
  method?: Method;
  blocks: Block[];
}

export const SECTIONS: { key: Section; label: string }[] = [
  { key: "start", label: "Getting started" },
  { key: "api", label: "API reference" },
  { key: "webhooks", label: "Webhooks" },
  { key: "guides", label: "Guides" },
  { key: "help", label: "Help" },
];

export const API_PATH = "/api/v1/public";
