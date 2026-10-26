import type { Block, DocPage } from "./types";
import { EVENT_DOCS } from "./webhooks";

/** A page as Markdown, for "Copy page" (handy for pasting into notes or an AI assistant). */
export function toMarkdown(page: DocPage, base: string): string {
  const out = [`# ${page.title}`, "", page.description, ""];
  for (const b of page.blocks) out.push(block(b, base), "");
  return (
    out
      .join("\n")
      .replaceAll("{{BASE_URL}}", base)
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

function fence(lang: string, code: string) {
  return "```" + lang + "\n" + code + "\n```";
}

function block(b: Block, base: string): string {
  switch (b.t) {
    case "p":
      return b.text;
    case "h2":
      return `## ${b.text}`;
    case "h3":
      return `### ${b.text}`;
    case "list":
      return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${i}`).join("\n");
    case "callout":
      return `> **${b.title ?? b.kind.toUpperCase()}**: ${b.text}`;
    case "steps":
      return b.items.map((s, n) => `${n + 1}. **${s.title}**: ${s.text}`).join("\n");
    case "image":
      return `![${b.shot.alt}](${b.shot.src})`;
    case "code":
      return fence(b.lang, b.code);
    case "codetabs":
      return b.samples.map((s) => `**${s.label}**\n\n${fence(s.lang, s.code)}`).join("\n\n");
    case "endpoint": {
      const s = b.spec;
      const parts = [`\`${s.method} ${base}${s.path}\``];
      if (s.body) parts.push("Request body:", fence("json", JSON.stringify(s.body, null, 2)));
      parts.push(`Response (${s.status ?? 200}):`, fence("json", JSON.stringify(s.response, null, 2)));
      return parts.join("\n\n");
    }
    case "params":
      return [
        `### ${b.title}`,
        "",
        "| Name | Type | Required | Description |",
        "| --- | --- | --- | --- |",
        ...b.rows.map((r) => `| \`${r.name}\` | ${r.type} | ${r.required ? "Yes" : "No"} | ${r.desc} |`),
      ].join("\n");
    case "json":
      return `${b.title}${b.status ? ` (${b.status})` : ""}:\n\n${fence("json", JSON.stringify(b.value, null, 2))}`;
    case "table":
      return [
        `| ${b.head.join(" | ")} |`,
        `| ${b.head.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
    case "cards":
      return b.items.map((c) => `- [${c.title}](${c.href}): ${c.text}`).join("\n");
    case "events":
      return EVENT_DOCS.map((e) => `### \`${e.event}\`\n\n${e.when}`).join("\n\n");
  }
}
