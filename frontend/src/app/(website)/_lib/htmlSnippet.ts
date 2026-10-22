export type SnippetNode =
  | { kind: "meta" | "link"; attrs: Record<string, string | true> }
  | { kind: "script" | "style" | "noscript"; attrs: Record<string, string | true>; content: string }
  | { kind: "raw"; html: string };

const ATTRS = `((?:[^>"']|"[^"]*"|'[^']*')*)`;
const TOKEN = new RegExp(
  `<!--[\\s\\S]*?-->|<(script|style|noscript)\\b${ATTRS}>([\\s\\S]*?)</\\1\\s*>|<(meta|link)\\b${ATTRS}>`,
  "gi"
);
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'" };

function decode(value: string) {
  return value.replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, name: string) => ENTITIES[name]);
}

function parseAttrs(source: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  for (const m of source.replace(/\/\s*$/, "").matchAll(ATTR)) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs[m[1].toLowerCase()] = value === undefined ? true : decode(value);
  }
  return attrs;
}

export function parseHtmlSnippet(html: string): SnippetNode[] {
  const nodes: SnippetNode[] = [];
  const pushRaw = (chunk: string) => {
    if (chunk.trim()) nodes.push({ kind: "raw", html: chunk.trim() });
  };
  let last = 0;
  for (const m of html.matchAll(TOKEN)) {
    pushRaw(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      const kind = m[1].toLowerCase() as "script" | "style" | "noscript";
      nodes.push({ kind, attrs: parseAttrs(m[2]), content: m[3] });
    } else if (m[4]) {
      nodes.push({ kind: m[4].toLowerCase() as "meta" | "link", attrs: parseAttrs(m[5]) });
    }
  }
  pushRaw(html.slice(last));
  return nodes;
}

const REACT_NAMES: Record<string, string> = {
  class: "className",
  charset: "charSet",
  crossorigin: "crossOrigin",
  "http-equiv": "httpEquiv",
  hreflang: "hrefLang",
  imagesizes: "imageSizes",
  imagesrcset: "imageSrcSet",
  itemprop: "itemProp",
  nomodule: "noModule",
  referrerpolicy: "referrerPolicy",
  fetchpriority: "fetchPriority",
};

const BOOLEAN_ATTRS = new Set(["async", "defer", "nomodule", "disabled", "itemscope"]);

export function toReactProps(attrs: Record<string, string | true>): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith("on") || name === "style") continue;
    const key = REACT_NAMES[name] ?? name;
    props[key] = value === true ? (BOOLEAN_ATTRS.has(name) ? true : "") : value;
  }
  return props;
}

export function hashString(value: string) {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
