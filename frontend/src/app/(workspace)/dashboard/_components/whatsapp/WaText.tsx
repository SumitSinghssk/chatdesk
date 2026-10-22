import { Fragment, type ReactNode } from "react";

// WhatsApp formatting: *bold* _italic_ ~strike~ `code` ```monospace```, links and {{variables}}
const INLINE =
  /(\{\{\s*\w+\s*\}\}|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function inline(text: string, key: string, variable?: (name: string) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    const inner = token.slice(1, -1);
    if (token.startsWith("{{")) {
      const name = token.replace(/[{}\s]/g, "");
      out.push(<Fragment key={k}>{variable ? variable(name) : token}</Fragment>);
    } else if (token.startsWith("http")) {
      out.push(
        <span key={k} className="text-[#027eb5] underline-offset-2 dark:text-[#53bdeb]">
          {token}
        </span>
      );
    } else if (token[0] === "*") {
      out.push(<strong key={k}>{inline(inner, k, variable)}</strong>);
    } else if (token[0] === "_") {
      out.push(<em key={k}>{inline(inner, k, variable)}</em>);
    } else if (token[0] === "~") {
      out.push(<s key={k}>{inline(inner, k, variable)}</s>);
    } else {
      out.push(
        <code key={k} className="rounded bg-black/5 px-1 font-mono text-[0.92em] dark:bg-white/10">
          {inner}
        </code>
      );
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renders message text the way WhatsApp shows it. `variable` decides how a {{name}} left in the
 * text looks (the builder highlights unfilled ones).
 */
export function WaText({ text, variable }: { text: string; variable?: (name: string) => ReactNode }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, b) =>
        block.startsWith("```") && block.endsWith("```") && block.length >= 6 ? (
          <span key={b} className="font-mono text-[0.92em]">
            {block.slice(3, -3)}
          </span>
        ) : (
          <Fragment key={b}>{inline(block, `b${b}`, variable)}</Fragment>
        )
      )}
    </>
  );
}

/** Replaces {{name}} with values; names without a value stay as they are. */
export function fillVariables(text: string, values: Record<string, string | undefined>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => values[name]?.trim() || whole);
}
