import { Fragment, type ReactNode } from "react";

/**
 * Renders an AI reply as safe React elements (never HTML): paragraphs, bullet and numbered lists,
 * bold, italics, `code` and links. "web" reads light markdown (**bold**, [text](url)); "whatsapp"
 * reads WhatsApp formatting (*bold*, _italic_, ~strike~).
 */
export function ChatText({
  text,
  style = "web",
  linkClassName,
}: {
  text: string;
  style?: "web" | "whatsapp";
  linkClassName?: string;
}) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? "my-1 list-decimal pl-5" : "my-1 list-disc pl-5"}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, style, linkClassName)}</li>
        ))}
      </Tag>
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•])\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (!line.trim()) {
      blocks.push(<span key={blocks.length} className="block h-2" aria-hidden />);
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      <p key={blocks.length} className={heading ? "font-semibold" : undefined}>
        {inline(heading ? heading[1]! : line, style, linkClassName)}
      </p>
    );
  }
  flush();
  return <>{blocks}</>;
}

const URL = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/;

function inline(text: string, style: "web" | "whatsapp", linkClassName?: string): ReactNode[] {
  const rules =
    style === "web"
      ? /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/
      : /(\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|~([^~\s][^~]*)~|```([^`]+)```|`([^`]+)`)/;
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  const link = (href: string, label: ReactNode) => (
    <a
      key={key++}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={linkClassName ?? "underline underline-offset-2"}
    >
      {label}
    </a>
  );
  const plain = (chunk: string) => {
    let s = chunk;
    while (s) {
      const m = URL.exec(s);
      if (!m) {
        out.push(<Fragment key={key++}>{s}</Fragment>);
        return;
      }
      if (m.index) out.push(<Fragment key={key++}>{s.slice(0, m.index)}</Fragment>);
      out.push(link(m[0], m[0]));
      s = s.slice(m.index + m[0].length);
    }
  };
  while (rest) {
    const m = rules.exec(rest);
    if (!m) {
      plain(rest);
      break;
    }
    if (m.index) plain(rest.slice(0, m.index));
    if (style === "web") {
      if (m[2] && m[3]) out.push(link(m[3], m[2]));
      else if (m[4]) out.push(<strong key={key++}>{m[4]}</strong>);
      else if (m[5])
        out.push(
          <code key={key++} className="rounded bg-black/5 px-1 text-[0.92em] dark:bg-white/10">
            {m[5]}
          </code>
        );
      else if (m[6]) out.push(<em key={key++}>{m[6]}</em>);
      else if (m[7]) out.push(<em key={key++}>{m[7]}</em>);
    } else {
      if (m[2]) out.push(<strong key={key++}>{m[2]}</strong>);
      else if (m[3]) out.push(<em key={key++}>{m[3]}</em>);
      else if (m[4]) out.push(<s key={key++}>{m[4]}</s>);
      else if (m[5] || m[6])
        out.push(
          <code key={key++} className="font-mono text-[0.92em]">
            {m[5] ?? m[6]}
          </code>
        );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
