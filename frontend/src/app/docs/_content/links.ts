import { CUSTOMER_ROUTES } from "@/config/routes/customer";

/** A link target in docs text: `doc:api/send-message#anchor` → the docs page URL; anything else as is. */
export function resolveDocLink(to: string) {
  if (!to.startsWith("doc:")) return to;
  const [slug, hash] = to.slice(4).split("#");
  return CUSTOMER_ROUTES.DOCS_PAGE(slug, hash);
}

/** Every `[label](doc:...)` link in a piece of docs text, resolved to its URL. */
export function resolveDocLinks(text: string) {
  return text.replace(/\]\((doc:[^)\s]*)\)/g, (_, to: string) => `](${resolveDocLink(to)})`);
}
