"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  Lock,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, Input, Modal, Select, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime } from "@/lib/utils";

import { DIAGRAMS_QK, diagramsApi, type Diagram, type TeamAccess } from "../../../_lib/diagramsApi";
import { pagesOrDefault } from "./Pages";

type Role = "edit" | "comment" | "view";
const ROLE_LABEL: Record<Role, string> = { edit: "Can edit", comment: "Can comment", view: "Can view" };

/** "2026-10-27T18:30" in the browser's time zone. */
function localInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Who in the team can open it, and the link for people outside the workspace (view or comment only). */
export function ShareDialog({
  diagram,
  open,
  onClose,
  onSaved,
}: {
  diagram: Diagram;
  open: boolean;
  onClose: () => void;
  onSaved: (d: Diagram) => void;
}) {
  const confirm = useConfirm();
  const team = useQuery({
    queryKey: DIAGRAMS_QK.TEAM,
    queryFn: async () => (await diagramsApi.team()).data,
    enabled: open,
  });
  const [teamAccess, setTeamAccess] = useState<TeamAccess>(diagram.team_access);
  const [members, setMembers] = useState(diagram.members ?? []);
  const link = diagram.link!;
  const [linkAccess, setLinkAccess] = useState<"view" | "comment">(link.access);
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState(localInput(link.expires_at));
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = link.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}${CUSTOMER_ROUTES.SHARED_DIAGRAM(link.token)}`
    : "";

  const run = async (key: string, fn: () => Promise<{ message?: string; data: Diagram }>) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
      return res.data;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveTeam = () =>
    run("team", () => diagramsApi.setAccess(diagram.id, { team_access: teamAccess, members }));

  const saveLink = (enabled: boolean, extra: { password?: string | null; new_link?: boolean } = {}) =>
    run(enabled ? "link" : "off", () =>
      diagramsApi.setLink(diagram.id, {
        enabled,
        access: linkAccess,
        expires_at: expires ? new Date(expires).toISOString() : null,
        ...extra,
      })
    );

  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const others = (team.data ?? []).filter((p) => p.role !== "owner" && p.name !== diagram.created_by);
  const unadded = others.filter((p) => !members.some((m) => m.member_id === p.id) && p.role === "agent");

  return (
    <Modal open={open} onClose={onClose} title={`Share “${diagram.name}”`} size="md">
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <UsersRound className="text-fg-subtle h-4 w-4" /> Your team
          </h3>
          <Select
            id="team-access"
            label="Everyone in your workspace"
            value={teamAccess}
            onChange={(v) => setTeamAccess(v as TeamAccess)}
            options={[
              { value: "edit", label: "Can edit", description: "Change it, live, with everyone else" },
              { value: "comment", label: "Can comment", description: "See it and leave comments" },
              { value: "view", label: "Can view", description: "Only look at it" },
              {
                value: "private",
                label: "No access",
                description: "Only owners, admins and the people below",
              },
            ]}
            hint="Owners and admins can always open and manage every diagram."
          />
          {members.length > 0 && (
            <ul className="divide-line border-line divide-y rounded-lg border">
              {members.map((m) => {
                const p = team.data?.find((x) => x.id === m.member_id);
                return (
                  <li key={m.member_id} className="flex items-center gap-2 px-3 py-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: p?.color ?? "#64748b" }}
                    >
                      {(p?.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block truncate text-sm font-medium">
                        {p?.name ?? "Team member"}
                      </span>
                      <span className="text-fg-subtle block truncate text-xs">{p?.email}</span>
                    </span>
                    <Select
                      id={`member-${m.member_id}`}
                      aria-label={`What ${p?.name ?? "they"} can do`}
                      size="sm"
                      value={m.role}
                      onChange={(role) =>
                        setMembers(
                          members.map((x) => (x.member_id === m.member_id ? { ...x, role: role as Role } : x))
                        )
                      }
                      options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
                        value: r,
                        label: ROLE_LABEL[r],
                      }))}
                      wrapperClassName="w-36"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${p?.name ?? "this person"}`}
                      onClick={() => setMembers(members.filter((x) => x.member_id !== m.member_id))}
                      className="text-fg-faint hover:text-danger rounded-md p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Select
              id="add-member"
              label="Give someone their own access"
              placeholder={unadded.length ? "Choose a team member" : "Everyone is added"}
              value=""
              disabled={!unadded.length}
              searchable
              onChange={(id) => setMembers([...members, { member_id: Number(id), role: "edit" }])}
              options={unadded.map((p) => ({ value: p.id, label: p.name, description: p.email }))}
              wrapperClassName="min-w-0 flex-1"
            />
            <Button loading={busy === "team"} onClick={() => void saveTeam()}>
              Save team access
            </Button>
          </div>
        </section>

        <section className="border-line space-y-3 border-t pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
                <Globe className="text-fg-subtle h-4 w-4" /> Share by link
              </h3>
              <p className="text-fg-subtle mt-0.5 text-xs">
                Anyone with the link can open it, without an account. They can view or comment, never edit.
              </p>
            </div>
            <Switch
              checked={link.enabled}
              aria-label="Share by link"
              disabled={!!busy}
              onChange={async (on) => {
                if (!on) {
                  const ok = await confirm({
                    title: "Turn the link off?",
                    message: "Anyone who has it can't open the diagram any more, straight away.",
                    confirmLabel: "Turn off",
                    variant: "danger",
                  });
                  if (!ok) return;
                }
                await saveLink(on);
              }}
            />
          </div>
          {link.enabled && link.token && (
            <>
              <div className="flex gap-2">
                <div className="border-line bg-page text-fg-muted flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-[13px]">
                  <Link2 className="text-fg-faint h-4 w-4 shrink-0" />
                  <span className="truncate font-mono text-xs" data-testid="share-url">
                    {url}
                  </span>
                </div>
                <Button variant="secondary" leftIcon={copied ? Check : Copy} onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  id="link-access"
                  label="People with the link"
                  value={linkAccess}
                  onChange={(v) => setLinkAccess(v as "view" | "comment")}
                  options={[
                    { value: "view", label: "Can view" },
                    { value: "comment", label: "Can view and comment" },
                  ]}
                />
                <Input
                  name="link_expires"
                  type="datetime-local"
                  label="Stops working on"
                  value={expires}
                  min={localInput(new Date().toISOString())}
                  onChange={(e) => setExpires(e.target.value)}
                  hint={link.expires_at ? `Now: ${formatDateTime(link.expires_at)}` : "Optional"}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  name="link_password"
                  type="password"
                  label={link.has_password ? "Change the password" : "Password (optional)"}
                  leftIcon={KeyRound}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={link.has_password ? "Leave empty to keep it" : "No password"}
                  wrapperClassName="min-w-0 flex-1"
                />
                {link.has_password && (
                  <Button
                    variant="ghost"
                    leftIcon={Lock}
                    disabled={!!busy}
                    onClick={() => void saveLink(true, { password: "" })}
                  >
                    Remove password
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="ghost"
                  leftIcon={RefreshCw}
                  disabled={!!busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Make a new link?",
                      message:
                        "The old link stops working. Send the new one to the people who should still see it.",
                      confirmLabel: "New link",
                      variant: "primary",
                    });
                    if (ok) await saveLink(true, { new_link: true });
                  }}
                >
                  New link
                </Button>
                <Button
                  loading={busy === "link"}
                  onClick={async () => {
                    const saved = await saveLink(true, password ? { password } : {});
                    if (saved) setPassword("");
                  }}
                >
                  Save link settings
                </Button>
              </div>
            </>
          )}
        </section>

        <EmbedSection diagram={diagram} onSaved={onSaved} />
      </div>
    </Modal>
  );
}

const HEIGHTS = ["400", "500", "600", "800"];

/** The code to show the diagram on a website: view only, live, and it can be switched off. */
function EmbedSection({ diagram, onSaved }: { diagram: Diagram; onSaved: (d: Diagram) => void }) {
  const confirm = useConfirm();
  const embed = diagram.embed ?? { enabled: false, token: null };
  const pages = pagesOrDefault(diagram.pages);
  const [page, setPage] = useState(pages[0].id);
  const [height, setHeight] = useState("500");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const save = async (enabled: boolean, newCode = false) => {
    setBusy(true);
    try {
      const res = await diagramsApi.setEmbed(diagram.id, { enabled, new_code: newCode });
      toast.success(res.message ?? "Saved");
      onSaved(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const query = new URLSearchParams();
  if (page !== pages[0].id) query.set("page", page);
  if (theme === "dark") query.set("theme", "dark");
  const src = embed.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}${CUSTOMER_ROUTES.EMBEDDED_DIAGRAM(embed.token)}${query.size ? `?${query}` : ""}`
    : "";
  const title = diagram.name.replace(/[<>"&]/g, "");
  const code = `<iframe src="${src}" title="${title}" width="100%" height="${height}" style="border:1px solid #e2e8f0;border-radius:12px" loading="lazy"></iframe>`;
  return (
    <section className="border-line space-y-3 border-t pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <Code2 className="text-fg-subtle h-4 w-4" /> Show on a website
          </h3>
          <p className="text-fg-subtle mt-0.5 text-xs">
            Paste the code into your website. Visitors see the diagram as it is now, view only, and it updates
            by itself.
          </p>
        </div>
        <Switch
          checked={embed.enabled}
          aria-label="Show on a website"
          disabled={busy}
          onChange={async (on) => {
            if (!on) {
              const ok = await confirm({
                title: "Stop showing it on websites?",
                message: "Websites with the code show “This diagram isn't shown here any more” instead.",
                confirmLabel: "Stop showing",
                variant: "danger",
              });
              if (!ok) return;
            }
            await save(on);
          }}
        />
      </div>
      {embed.enabled && embed.token && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {pages.length > 1 && (
              <Select
                id="embed-page"
                label="Page"
                value={page}
                onChange={setPage}
                options={pages.map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
            <Select
              id="embed-height"
              label="Height"
              value={height}
              onChange={setHeight}
              options={HEIGHTS.map((h) => ({ value: h, label: `${h} px` }))}
            />
            <Select
              id="embed-theme"
              label="Look"
              value={theme}
              onChange={(v) => setTheme(v as "light" | "dark")}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <div className="relative">
            <textarea
              readOnly
              value={code}
              rows={3}
              aria-label="Code for your website"
              data-testid="embed-code"
              onFocus={(e) => e.target.select()}
              className="border-line bg-page text-fg-muted w-full resize-none rounded-lg border p-2.5 pr-24 font-mono text-[11.5px] leading-relaxed outline-none"
            />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={copied ? Check : Copy}
              className="absolute top-2 right-2"
              onClick={async () => {
                await navigator.clipboard.writeText(code).catch(() => null);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              leftIcon={RefreshCw}
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: "Make a new code?",
                  message: "Websites with the old code stop showing the diagram until you paste the new one.",
                  confirmLabel: "New code",
                  variant: "primary",
                });
                if (ok) await save(true, true);
              }}
            >
              New code
            </Button>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="text-primary flex items-center gap-1 text-sm font-medium hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Preview
            </a>
          </div>
        </>
      )}
    </section>
  );
}
