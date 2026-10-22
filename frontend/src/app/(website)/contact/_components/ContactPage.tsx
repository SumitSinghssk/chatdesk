import { Mail, MapPin, Phone } from "lucide-react";

import { getSettings } from "@/app/(website)/_lib/websiteApi";

import { PageSeo } from "@/app/(website)/_components/PageSeo";
import { Container, PageHero } from "@/app/(website)/_components/ui";
import { ContactForm } from "./ContactForm";

import { WEBSITE_ROUTES } from "@/config/routes";
export default async function ContactPage() {
  const settings = await getSettings();
  const g = settings?.general;
  const map = g?.addresses.find((a) => a.map_iframe)?.map_iframe;

  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.CONTACT()} />
      <PageHero
        eyebrow="Contact"
        title="Let's talk"
        description="Questions, projects or partnerships — send us a message and we'll reply within one business day."
      />
      <Container className="grid gap-10 py-14 lg:grid-cols-5">
        <div className="relative lg:col-span-3">
          <div className="border-line bg-surface rounded-2xl border p-6 shadow-xs sm:p-8">
            <ContactForm />
          </div>
        </div>
        <aside className="space-y-4 lg:col-span-2">
          {g?.addresses.map((a, i) => (
            <InfoCard key={i} icon={MapPin} title={a.label || "Address"}>
              {a.text}
            </InfoCard>
          ))}
          {!!g?.phones.length && (
            <InfoCard icon={Phone} title="Phone">
              {g.phones.map((p) => (
                <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="hover:text-primary block">
                  {p}
                </a>
              ))}
            </InfoCard>
          )}
          {!!g?.emails.length && (
            <InfoCard icon={Mail} title="Email">
              {g.emails.map((e) => (
                <a key={e} href={`mailto:${e}`} className="hover:text-primary block">
                  {e}
                </a>
              ))}
            </InfoCard>
          )}
          {map && (
            <div
              className="border-line overflow-hidden rounded-2xl border [&_iframe]:h-64 [&_iframe]:w-full"
              dangerouslySetInnerHTML={{ __html: map }}
            />
          )}
        </aside>
      </Container>
    </>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Mail;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line bg-surface flex gap-4 rounded-2xl border p-5 shadow-xs">
      <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-fg-muted min-w-0 text-sm">
        <p className="text-fg mb-1 font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}
