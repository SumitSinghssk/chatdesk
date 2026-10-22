"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Inbox,
  LayoutDashboard,
  MailWarning,
  Users,
} from "lucide-react";

import {
  AccessDenied,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
} from "@/app/admin/_components/ui/index";
import { dashboardApi, type DashboardData } from "@/app/admin/_lib/api/dashboardApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { cn, formatDate, timeAgo, titleCase } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { EnquiriesChart } from "./EnquiriesChart";

import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function WeekTrend({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <>{current ? "No enquiries the week before" : "vs. 0 last week"}</>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
      <Icon size={13} aria-hidden />
      {Math.abs(pct)}% <span className="text-fg-subtle font-normal">vs. last week ({previous})</span>
    </span>
  );
}

function Panel({
  title,
  description,
  href,
  linkLabel = "View all",
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          href && (
            <Button href={href} variant="ghost" size="sm" rightIcon={ArrowRight}>
              {linkLabel}
            </Button>
          )
        }
      />
      {children}
    </Card>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-line divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

function HealthRow({ label, count, href }: { label: string; count: number; href: string }) {
  const ok = count === 0;
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-hover flex items-center gap-3 px-4 py-3 text-sm transition-colors"
      >
        {ok ? (
          <CheckCircle2 size={16} className="text-success shrink-0" aria-hidden />
        ) : (
          <AlertTriangle size={16} className="text-warning shrink-0" aria-hidden />
        )}
        <span className="text-fg flex-1">{label}</span>
        <span className={cn("font-semibold", ok ? "text-fg-subtle" : "text-warning")}>{count}</span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const can = usePermissions();
  const userName = useAuthStore((s) => s.user?.name);
  const { data, isLoading } = useQuery({
    queryKey: [QK.DASHBOARD],
    queryFn: dashboardApi.get,
    staleTime: 30_000,
  });

  if (!can(PERM.DASHBOARD_VIEW)) return <AccessDenied />;

  const canEnquiries = can(PERM.ENQUIRIES_VIEW);
  const canBlogs = can(PERM.BLOGS_VIEW);
  const canPages = can(PERM.PAGES_VIEW);
  const canActivity = can(PERM.ACTIVITY_LOGS_VIEW);
  const s: DashboardData["stats"] | undefined = data?.stats;
  const name = data?.greeting_name || userName?.split(" ")[0] || "";
  const value = (n: number | undefined) =>
    isLoading || n === undefined ? <Skeleton className="mt-1 h-6 w-12" /> : n;

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title={`${greeting()}${name ? `, ${name}` : ""}`}
        description="Here's what's happening across your site."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {canEnquiries && (
          <>
            <StatCard
              label="Enquiries this week"
              value={value(s?.enquiries_this_week)}
              icon={Inbox}
              tone="blue"
              hint={s && <WeekTrend current={s.enquiries_this_week} previous={s.enquiries_prev_week} />}
            />
            <StatCard
              label="Unread enquiries"
              value={value(s?.unread_enquiries)}
              icon={MailWarning}
              tone={s?.unread_enquiries ? "red" : "green"}
              hint={s && (s.unread_enquiries ? "Waiting for a reply" : "All caught up")}
            />
          </>
        )}
        {canBlogs && (
          <StatCard
            label="Published posts"
            value={value(s?.published_blogs)}
            icon={BookOpen}
            tone="purple"
            hint={
              s &&
              (s.draft_blogs
                ? `${s.draft_blogs} draft${s.draft_blogs === 1 ? "" : "s"} in progress`
                : "No drafts")
            }
          />
        )}
        {canPages && (
          <StatCard label="Published pages" value={value(s?.published_pages)} icon={FileText} tone="yellow" />
        )}
        {can(PERM.USERS_VIEW) && (
          <StatCard label="Active users" value={value(s?.active_users)} icon={Users} tone="green" />
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {canEnquiries && (
          <div className="lg:col-span-2">
            <Panel
              title="Enquiries – last 14 days"
              description="New enquiries received per day."
              href={ADMIN_ROUTES.ENQUIRIES()}
            >
              <CardBody>
                {isLoading || !data ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <EnquiriesChart data={data.enquiries_chart} />
                )}
              </CardBody>
            </Panel>
          </div>
        )}

        {(canBlogs || canPages) && (
          <Panel title="Content health" description="Items missing SEO essentials.">
            {isLoading || !data ? (
              <ListSkeleton rows={3} />
            ) : (
              <ul className="divide-line divide-y">
                {canBlogs && (
                  <>
                    <HealthRow
                      label="Posts without a featured image"
                      count={data.content_health.blogs_without_image}
                      href={ADMIN_ROUTES.BLOGS()}
                    />
                    <HealthRow
                      label="Posts without a meta description"
                      count={data.content_health.blogs_without_meta_description}
                      href={ADMIN_ROUTES.BLOGS()}
                    />
                  </>
                )}
                {canPages && (
                  <HealthRow
                    label="Pages without a meta description"
                    count={data.content_health.pages_without_meta_description}
                    href={ADMIN_ROUTES.PAGES()}
                  />
                )}
              </ul>
            )}
          </Panel>
        )}

        {canEnquiries && (
          <Panel title="Recent enquiries" href={ADMIN_ROUTES.ENQUIRIES()}>
            {isLoading || !data ? (
              <ListSkeleton />
            ) : data.recent_enquiries.length === 0 ? (
              <EmptyState icon={Inbox} title="No enquiries yet" className="py-10" />
            ) : (
              <ul className="divide-line divide-y">
                {data.recent_enquiries.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={ADMIN_ROUTES.ENQUIRIES({ enquiry: e.id })}
                      className="hover:bg-hover flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-fg truncate text-sm font-medium">{e.name}</p>
                        <p className="text-fg-subtle truncate text-xs">
                          {e.reference} · {e.subject || "No subject"} · {timeAgo(e.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {canBlogs && (
          <Panel title="Latest posts" href={ADMIN_ROUTES.BLOGS()}>
            {isLoading || !data ? (
              <ListSkeleton />
            ) : data.latest_blogs.length === 0 ? (
              <EmptyState icon={BookOpen} title="No posts yet" className="py-10" />
            ) : (
              <ul className="divide-line divide-y">
                {data.latest_blogs.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={ADMIN_ROUTES.BLOGS({ open: b.id })}
                      className="hover:bg-hover flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-fg truncate text-sm font-medium">{b.title}</p>
                        <p className="text-fg-subtle truncate text-xs">
                          {b.published_at ? `Published ${formatDate(b.published_at)}` : "Not published"}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {canActivity && (
          <Panel title="Recent activity" href={ADMIN_ROUTES.ACTIVITY_LOGS()}>
            {isLoading || !data ? (
              <ListSkeleton />
            ) : data.recent_activity.length === 0 ? (
              <EmptyState title="No activity yet" className="py-10" />
            ) : (
              <ol className="space-y-0 px-4 py-2">
                {data.recent_activity.map((a) => (
                  <li key={a.id} className="border-line relative flex gap-3 border-l py-2 pl-4">
                    <span
                      className="bg-primary absolute top-3.5 -left-[4.5px] h-2 w-2 rounded-full"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-fg text-sm">
                        <span className="font-medium">{a.user || "System"}</span>{" "}
                        <span className="text-fg-muted">{a.description || titleCase(a.action)}</span>
                        {a.subject_label && <span className="text-fg-muted"> · {a.subject_label}</span>}
                      </p>
                      <p className="text-fg-subtle text-xs">{timeAgo(a.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
