"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Folder,
  Globe,
  ListTodo,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Button,
  Card,
  Dropdown,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Select,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, timeAgo } from "@/lib/utils";

import { DIAGRAMS_QK, diagramsApi, type DiagramSummary } from "../../_lib/diagramsApi";
import { FolderDialog } from "./FolderDialog";
import { MyTasks } from "./MyTasks";
import { AI_KINDS, type AiKind } from "./editor/AiPanel";
import { graphShapes } from "./editor/aiGraph";
import { toContent } from "./editor/model";
import { TEMPLATES } from "./templates";
import { previewOf, Thumbnail } from "./Thumbnail";

type Filter = { kind: "all" } | { kind: "starred" } | { kind: "tasks" } | { kind: "folder"; name: string };

export function Diagrams() {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<DiagramSummary | null>(null);
  const q = useDebouncedValue(search, 250);
  const params = {
    search: q || undefined,
    starred: filter.kind === "starred" || undefined,
    folder: filter.kind === "folder" ? filter.name : undefined,
  };
  const list = useQuery({
    queryKey: DIAGRAMS_QK.LIST(params),
    queryFn: () => diagramsApi.list(params),
    placeholderData: (prev) => prev,
  });
  const all = useQuery({ queryKey: DIAGRAMS_QK.LIST({}), queryFn: () => diagramsApi.list({}) });
  const folders = all.data?.folders ?? [];
  const openTasks = useQuery({ queryKey: DIAGRAMS_QK.TASKS(false), queryFn: () => diagramsApi.tasks(false) });
  const taskCount = openTasks.data?.data.length ?? 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: DIAGRAMS_QK.ALL });

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast.success(done);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (d: DiagramSummary) => {
    const ok = await confirm({
      title: `Delete “${d.name}”?`,
      message: "It's deleted for everyone, with its comments and versions. Share links stop working.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) await act(() => diagramsApi.remove(d.id), "Diagram deleted");
  };

  const items = list.data?.data ?? [];
  const chips: {
    key: string;
    label: string;
    on: boolean;
    pick: () => void;
    icon?: typeof Star;
    count?: number;
  }[] = [
    { key: "all", label: "All", on: filter.kind === "all", pick: () => setFilter({ kind: "all" }) },
    {
      key: "starred",
      label: "Starred",
      icon: Star,
      on: filter.kind === "starred",
      pick: () => setFilter({ kind: "starred" }),
    },
    {
      key: "tasks",
      label: "My tasks",
      icon: ListTodo,
      on: filter.kind === "tasks",
      pick: () => setFilter({ kind: "tasks" }),
      count: taskCount,
    },
    ...folders.map((name) => ({
      key: `f:${name}`,
      label: name,
      icon: Folder,
      on: filter.kind === "folder" && filter.name === name,
      pick: () => setFilter({ kind: "folder", name }),
    })),
  ];

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-fg text-lg font-semibold">Diagrams</h1>
          <p className="text-fg-subtle text-sm">Draw flows, plans and charts together. Share them by link.</p>
        </div>
        <Button leftIcon={Plus} onClick={() => setCreating(true)}>
          New diagram
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          leftIcon={Search}
          placeholder="Search diagrams"
          aria-label="Search diagrams"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="w-full sm:w-64"
        />
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.pick}
              aria-pressed={c.on}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                c.on
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-fg-muted hover:bg-hover"
              )}
            >
              {c.icon && <c.icon className="h-3.5 w-3.5" />}
              {c.label}
              {!!c.count && (
                <span className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px] font-bold">
                  {c.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {filter.kind === "tasks" ? (
        <MyTasks />
      ) : list.error ? (
        <ErrorBanner message={errorMessage(list.error)} />
      ) : list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title={q || filter.kind !== "all" ? "No diagrams here" : "No diagrams yet"}
            description={
              q || filter.kind !== "all"
                ? "Try another search or folder."
                : "Map out a process, a project or a customer journey, and work on it together, live."
            }
            action={
              <Button leftIcon={Plus} onClick={() => setCreating(true)}>
                New diagram
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((d) => (
            <li
              key={d.id}
              className="group border-line bg-surface relative rounded-xl border shadow-xs transition hover:shadow-md"
            >
              <Link href={CUSTOMER_ROUTES.DIAGRAM(d.id)} className="block" aria-label={`Open ${d.name}`}>
                <div className="bg-page border-line text-fg-faint flex h-36 items-center justify-center overflow-hidden rounded-t-xl border-b p-3">
                  <Thumbnail preview={d.preview} className="h-full w-full" />
                </div>
                <div className="space-y-1 p-3 pr-10">
                  <p className="text-fg flex items-center gap-1.5 truncate text-sm font-semibold">
                    {d.starred && (
                      <Star
                        className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                        aria-label="Starred"
                      />
                    )}
                    <span className="truncate">{d.name}</span>
                  </p>
                  <p className="text-fg-subtle truncate text-xs">
                    Edited {timeAgo(d.updated_at)}
                    {d.updated_by ? ` by ${d.updated_by}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {d.folder && (
                      <span className="bg-hover text-fg-subtle inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                        <Folder className="h-3 w-3" /> {d.folder}
                      </span>
                    )}
                    {d.shared && (
                      <span className="bg-info-soft text-info inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                        <Globe className="h-3 w-3" /> Link on
                      </span>
                    )}
                    {d.team_access === "private" && (
                      <span className="bg-hover text-fg-subtle inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                        <Lock className="h-3 w-3" /> Private
                      </span>
                    )}
                    {(d.level === "view" || d.level === "comment") && (
                      <span className="bg-hover text-fg-subtle rounded-full px-2 py-0.5 text-[11px]">
                        {d.level === "view" ? "View only" : "Can comment"}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <div className="absolute right-2 bottom-2">
                <Dropdown
                  align="right"
                  width="w-48"
                  trigger={() => (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={MoreHorizontal}
                      aria-label={`More for ${d.name}`}
                    />
                  )}
                  items={[
                    {
                      label: d.starred ? "Remove star" : "Star",
                      icon: Star,
                      onClick: () => void act(() => diagramsApi.star(d.id, !d.starred)),
                    },
                    {
                      label: "Move to folder",
                      icon: Folder,
                      hidden: d.level === "view" || d.level === "comment",
                      onClick: () => setMoving(d),
                    },
                    {
                      label: "Make a copy",
                      icon: Copy,
                      onClick: () => void act(() => diagramsApi.duplicate(d.id), "Copy made"),
                    },
                    {
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      hidden: d.level !== "manage",
                      onClick: () => void remove(d),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewDiagram
          folders={folders}
          folder={filter.kind === "folder" ? filter.name : null}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            refresh();
            router.push(CUSTOMER_ROUTES.DIAGRAM(id));
          }}
        />
      )}
      {moving && (
        <FolderDialog
          open
          value={moving.folder}
          onClose={() => setMoving(null)}
          onSave={async (folder) => {
            await diagramsApi.update(moving.id, { folder });
            refresh();
            toast.success(folder ? `Moved to ${folder}` : "Taken out of its folder");
          }}
        />
      )}
    </div>
  );
}

function NewDiagram({
  folders,
  folder: startFolder,
  onClose,
  onCreated,
}: {
  folders: string[];
  folder: string | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [pick, setPick] = useState(TEMPLATES[0].key);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<AiKind>("any");
  const byAi = pick === "ai";
  const [name, setName] = useState("");
  const [folder, setFolder] = useState(startFolder ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const template = TEMPLATES.find((t) => t.key === pick) ?? TEMPLATES[0];

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      let content = template.content;
      let finalName = name.trim() || (template.key === "blank" ? "Untitled diagram" : template.name);
      if (byAi) {
        const graph = (await diagramsApi.aiDraw({ prompt: prompt.trim(), kind })).data;
        const drawn = graphShapes(graph);
        content = toContent(drawn.nodes, drawn.edges);
        finalName = name.trim() || graph.title;
      }
      const res = await diagramsApi.create({
        name: finalName,
        folder: folder.trim() || null,
        content,
      });
      toast.success("Diagram created");
      onCreated(res.data.id);
    } catch (err) {
      if (byAi) toast.error(errorMessage(err));
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New diagram"
      description="Start blank or from a ready-made layout. You can change everything."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void create()}
            loading={busy}
            disabled={byAi && prompt.trim().length < 3}
            leftIcon={byAi ? Sparkles : undefined}
          >
            {byAi ? (busy ? "Drawing…" : "Draw and open") : "Create and open"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Start from">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={pick === t.key}
              onClick={() => setPick(t.key)}
              className={cn(
                "overflow-hidden rounded-xl border text-left transition",
                pick === t.key
                  ? "border-primary ring-primary/20 ring-2"
                  : "border-line hover:border-line-strong"
              )}
            >
              <span className="bg-page text-fg-faint flex h-20 items-center justify-center p-2">
                <Thumbnail preview={previewOf(t.content)} className="h-full w-full" />
              </span>
              <span className="block px-2 py-1.5">
                <span className="text-fg block truncate text-[13px] font-semibold">{t.name}</span>
                <span className="text-fg-subtle block truncate text-[11px]">{t.description}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={byAi}
            onClick={() => setPick("ai")}
            className={cn(
              "overflow-hidden rounded-xl border text-left transition",
              byAi ? "border-primary ring-primary/20 ring-2" : "border-line hover:border-line-strong"
            )}
          >
            <span className="flex h-20 items-center justify-center bg-gradient-to-br from-violet-50 to-sky-50 dark:from-violet-950/40 dark:to-sky-950/40">
              <Sparkles className="h-7 w-7 text-violet-500" />
            </span>
            <span className="block px-2 py-1.5">
              <span className="text-fg block truncate text-[13px] font-semibold">Describe it (AI)</span>
              <span className="text-fg-subtle block truncate text-[11px]">
                Say what it is, it&apos;s drawn
              </span>
            </span>
          </button>
        </div>
        {byAi && (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={4000}
              aria-label="Describe the diagram"
              placeholder="e.g. Our order process from a WhatsApp enquiry to delivery, with payment by link or cash on delivery"
              className="border-line bg-page text-fg focus:border-primary w-full resize-y rounded-lg border p-2.5 text-sm outline-none"
            />
            <Select
              id="new-ai-kind"
              label="Draw it as"
              value={kind}
              onChange={(v) => setKind(v as AiKind)}
              options={AI_KINDS}
              wrapperClassName="sm:w-60"
            />
            <p className="text-fg-faint text-xs">
              Uses the AI your business connected for the AI agent. Leave the name empty to use the AI&apos;s.
            </p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="diagram_name"
            label="Name"
            value={name}
            maxLength={150}
            placeholder={template.key === "blank" ? "e.g. Order process" : template.name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            error={error}
            autoFocus
          />
          <Input
            name="diagram_folder"
            label="Folder"
            value={folder}
            maxLength={60}
            list="new-diagram-folders"
            placeholder="Optional"
            onChange={(e) => setFolder(e.target.value)}
          />
          <datalist id="new-diagram-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>
    </Modal>
  );
}
