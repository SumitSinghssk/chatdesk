import { HtmlSnippets } from "./layout/HtmlSnippets";
import { getSeo } from "@/app/(website)/_lib/websiteApi";
import { jsonLd } from "@/app/(website)/_lib/seo";

export async function PageSeo({ path }: { path: string }) {
  const seo = await getSeo(path);
  if (!seo || seo.matched_path !== path) return null;

  let schema: string | null = null;
  if (seo.schema_markup?.trim()) {
    try {
      schema = JSON.stringify(JSON.parse(seo.schema_markup)).replace(/</g, "\\u003c");
    } catch {
      schema = null;
    }
  }
  const faqs = seo.faqs.filter((f) => f.question && f.answer);

  return (
    <>
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />}
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            }),
          }}
        />
      )}
      {seo.custom_css && <style dangerouslySetInnerHTML={{ __html: seo.custom_css }} />}
      <HtmlSnippets html={seo.header_scripts} target="head" />
      <HtmlSnippets html={seo.footer_scripts} target="body" />
    </>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
