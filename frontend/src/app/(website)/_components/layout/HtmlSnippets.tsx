import Script from "next/script";

import { hashString, parseHtmlSnippet, toReactProps } from "@/app/(website)/_lib/htmlSnippet";

const JS_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);

export function HtmlSnippets({ html, target }: { html: string | null | undefined; target: "head" | "body" }) {
  if (!html?.trim()) return null;
  const prefix = `sk-${target}-${hashString(html)}`;

  return parseHtmlSnippet(html).map((node, i) => {
    const key = `${prefix}-${i}`;
    switch (node.kind) {
      case "meta":
        return <meta key={key} {...toReactProps(node.attrs)} />;
      case "link":
        return <link key={key} {...toReactProps(node.attrs)} />;
      case "style":
        return (
          <style key={key} {...toReactProps(node.attrs)} dangerouslySetInnerHTML={{ __html: node.content }} />
        );
      case "noscript":
        return <noscript key={key} dangerouslySetInnerHTML={{ __html: node.content }} />;
      case "script": {
        const { type, id, src, async, defer, ...rest } = toReactProps(node.attrs);
        const scriptType = typeof type === "string" ? type.toLowerCase() : "";
        if (!JS_TYPES.has(scriptType)) {
          return (
            <script
              key={key}
              {...toReactProps(node.attrs)}
              dangerouslySetInnerHTML={{ __html: node.content }}
            />
          );
        }
        const props = {
          ...rest,
          ...(scriptType ? { type: scriptType } : {}),
          id: typeof id === "string" && id ? id : key,
          strategy: "afterInteractive" as const,
        };
        if (typeof src === "string" && src) {
          return <Script key={key} {...props} src={src} async={!!async || !!defer} defer={!!defer} />;
        }
        return <Script key={key} {...props} dangerouslySetInnerHTML={{ __html: node.content }} />;
      }
      default:
        return <div key={key} className="contents" dangerouslySetInnerHTML={{ __html: node.html }} />;
    }
  });
}
