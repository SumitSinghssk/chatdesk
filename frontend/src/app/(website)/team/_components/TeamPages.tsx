import Link from "next/link";
import { ArrowRight, Globe, Mail, Phone } from "lucide-react";

import type { TeamMember } from "@/app/(website)/_lib/websiteApi";
import { PageSeo } from "@/app/(website)/_components/PageSeo";
import { Container, PageHero, SectionHeading } from "@/app/(website)/_components/ui";
import { WEBSITE_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const BRAND_PATHS: Record<string, string> = {
  linkedin:
    "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z",
  twitter:
    "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z",
  facebook:
    "M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07Z",
  instagram:
    "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z",
  github:
    "M12 .3a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3Z",
  youtube:
    "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z",
};

const LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  github: "GitHub",
  youtube: "YouTube",
  website: "Website",
};

function SocialIcon({ platform }: { platform: string }) {
  const path = BRAND_PATHS[platform];
  if (!path) return <Globe className="h-4 w-4" />;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function Portrait({ member, className }: { member: TeamMember; className?: string }) {
  return member.photo ? (
    <img src={member.photo} alt={member.name} loading="lazy" className={cn("object-cover", className)} />
  ) : (
    <span
      className={cn(
        "bg-primary-soft text-primary flex items-center justify-center text-4xl font-bold",
        className
      )}
    >
      {member.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function TeamMemberCard({ member, compact }: { member: TeamMember; compact?: boolean }) {
  return (
    <article className="group border-line bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="bg-page aspect-square overflow-hidden">
        <Portrait
          member={member}
          className="h-full w-full transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-fg text-lg font-semibold">{member.name}</h3>
        {(member.designation || member.department) && (
          <p className="text-primary text-sm font-medium">
            {[member.designation, member.department].filter(Boolean).join(" · ")}
          </p>
        )}
        {!compact && member.bio && (
          <p className="text-fg-subtle mt-3 line-clamp-4 text-sm leading-relaxed whitespace-pre-line">
            {member.bio}
          </p>
        )}
        {(member.social_links.length > 0 || (!compact && (member.email || member.phone))) && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            {member.social_links.map((link) => (
              <a
                key={`${link.platform}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${member.name} on ${LABELS[link.platform] ?? link.platform}`}
                title={LABELS[link.platform] ?? link.platform}
                className="border-line text-fg-subtle hover:border-primary hover:text-primary flex h-8 w-8 items-center justify-center rounded-full border transition"
              >
                <SocialIcon platform={link.platform} />
              </a>
            ))}
            {!compact && member.email && (
              <a
                href={`mailto:${member.email}`}
                aria-label={`Email ${member.name}`}
                title={member.email}
                className="border-line text-fg-subtle hover:border-primary hover:text-primary flex h-8 w-8 items-center justify-center rounded-full border transition"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {!compact && member.phone && (
              <a
                href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}
                aria-label={`Call ${member.name}`}
                title={member.phone}
                className="border-line text-fg-subtle hover:border-primary hover:text-primary flex h-8 w-8 items-center justify-center rounded-full border transition"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function TeamPage({ members }: { members: TeamMember[] }) {
  const departments = [...new Set(members.map((m) => m.department).filter(Boolean))] as string[];
  const grouped =
    departments.length > 1
      ? [
          ...departments.map((d) => ({ title: d, items: members.filter((m) => m.department === d) })),
          { title: "More of the team", items: members.filter((m) => !m.department) },
        ].filter((g) => g.items.length)
      : [{ title: null, items: members }];

  return (
    <>
      <PageSeo path={WEBSITE_ROUTES.TEAM()} />
      <PageHero
        eyebrow="Our team"
        title="The people behind our work"
        description="Meet the team that makes it happen."
      />
      <Container className="py-12">
        {members.length === 0 ? (
          <p className="text-fg-subtle py-20 text-center">Our team page is coming soon.</p>
        ) : (
          <div className="space-y-14">
            {grouped.map((group) => (
              <section key={group.title ?? "all"}>
                {group.title && (
                  <h2 className="text-fg mb-6 text-xl font-bold tracking-tight">{group.title}</h2>
                )}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((m) => (
                    <TeamMemberCard key={m.id} member={m} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

export function TeamSection({ members }: { members: TeamMember[] }) {
  if (!members.length) return null;
  return (
    <section className="border-line bg-page border-t">
      <Container className="py-20">
        <SectionHeading eyebrow="Our team" title="Meet the people behind the work" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {members.slice(0, 4).map((m) => (
            <TeamMemberCard key={m.id} member={m} compact />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href={WEBSITE_ROUTES.TEAM()}
            className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            Meet the whole team <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
