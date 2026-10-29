"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Clock, Copy, Folder, Share2, Star, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Button, ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import {
  DIAGRAMS_QK,
  diagramsApi,
  type Diagram,
  type DiagramContent,
  type LiveState,
  type RecordType,
} from "../../_lib/diagramsApi";
import { chatbotsApi, type BotGraph, type BotMeta } from "../../_lib/chatbotsApi";
import { Canvas } from "./editor/Canvas";
import { ApprovalBanner } from "./editor/Approval";
import { History } from "./editor/History";
import { ShareDialog } from "./editor/ShareDialog";
import { FolderDialog } from "./FolderDialog";

/** /dashboard/diagrams/<id> */
export function DiagramEditor({ id }: { id: number }) {
  const params = useSearchParams();
  const query = useQuery({
    queryKey: DIAGRAMS_QK.ONE(id),
    queryFn: async () => (await diagramsApi.get(id)).data,
    staleTime: Infinity, // the live connection keeps it current
    refetchOnWindowFocus: false,
  });
  return (
    <div className="bg-page relative -m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-4 sm:h-[calc(100%+2rem)]">
      {query.isLoading ? (
        <Spinner className="h-full" />
      ) : query.error || !query.data ? (
        <div className="p-4">
          <ErrorBanner message={errorMessage(query.error ?? new Error("Diagram not found"))} />
          <Link
            href={CUSTOMER_ROUTES.DIAGRAMS()}
            className="text-primary mt-3 inline-block text-sm font-medium"
          >
            ← All diagrams
          </Link>
        </div>
      ) : (
        <ReactFlowProvider>
          <Editor
            initial={query.data}
            focusComment={Number(params.get("comment")) || null}
            startPage={params.get("page")}
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}

function Editor({
  initial,
  focusComment,
  startPage,
}: {
  initial: Diagram;
  focusComment: number | null;
  startPage: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [d, setD] = useState(initial);
  const [shareOpen, setShareOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [preview, setPreview] = useState<{ content: DiagramContent; label: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const comments = useQuery({
    queryKey: DIAGRAMS_QK.COMMENTS(d.id),
    queryFn: async () => (await diagramsApi.comments(d.id)).data,
  });
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: ["diagrams", "list"] });
  const manage = d.level === "manage";
  const canComment = d.level !== "view";
  const [state, setState] = useState<LiveState>({
    session: initial.session,
    now: initial.now,
    locked: initial.locked,
    approval: initial.approval,
    pages: initial.pages,
  });
  const team = useQuery({ queryKey: DIAGRAMS_QK.TEAM, queryFn: async () => (await diagramsApi.team()).data });
  const people = (team.data ?? [])
    .filter((p) => p.id !== d.me.id)
    .map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const canEditLevel = d.level === "edit" || manage;
  const records = useMemo(
    () => ({
      load: async () => (await diagramsApi.records(d.id)).data,
      search: async (type: RecordType, q: string) => (await diagramsApi.findRecords(type, q)).data,
      canOpen: true,
    }),
    [d.id]
  );
  const chatbot = useMemo(
    () => ({
      make: async (name: string, graph: BotGraph) => {
        const res = await chatbotsApi.importBot({
          name,
          // a draft, off, started by hand until they choose what starts it (the server fills in the settings)
          bot: {
            name,
            description: `Made from the diagram “${d.name}”`.slice(0, 300),
            trigger: "manual",
            match: "exact",
            keywords: [],
            restart_minutes: 0,
          } as unknown as BotMeta,
          graph,
        });
        toast.success("Chatbot made. Check it, then publish it.");
        router.push(CUSTOMER_ROUTES.CHATBOT(res.data.id));
      },
      load: async (id: number) => {
        const res = await chatbotsApi.get(id);
        return { name: res.data.name, graph: res.data.graph };
      },
    }),
    [d.name, router]
  );
  const ai = useMemo(
    () => ({
      options: async () => (await diagramsApi.aiOptions()).data,
      draw: async (prompt: string, kind: "any" | "flowchart" | "mindmap") =>
        (await diagramsApi.aiDraw({ prompt, kind })).data,
      summary: async () => (await diagramsApi.aiSummary(d.id)).data.text,
      suggest: async () => (await diagramsApi.aiSuggest(d.id)).data,
    }),
    [d.id]
  );

  const rename = async (name: string) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === d.name) return;
    try {
      const res = await diagramsApi.update(d.id, { name: name.trim() });
      setD((x) => ({ ...x, name: res.data.name }));
      refreshList();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${d.name}”?`,
      message: "It's deleted for everyone, with its comments and versions. Share links stop working.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await diagramsApi.remove(d.id);
      toast.success("Diagram deleted");
      refreshList();
      router.push(CUSTOMER_ROUTES.DIAGRAMS());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <Canvas
        name={d.name}
        content={d.content}
        seq={d.seq}
        level={d.level}
        me={d.me}
        focusComment={focusComment}
        startPage={startPage}
        records={records}
        ai={canComment ? ai : undefined}
        chatbot={chatbot}
        savePages={async (pages) => {
          await diagramsApi.update(d.id, { pages });
        }}
        confirmDeletePage={(pageName) =>
          confirm({
            title: `Delete the page “${pageName}”?`,
            message: "Everything on it is deleted too. You can get it back from the version history.",
            confirmLabel: "Delete page",
            variant: "danger",
          })
        }
        uploadImage={(file) => diagramsApi.uploadImage(d.id, file)}
        state={state}
        onState={setState}
        people={people}
        onCommenting={() => void team.refetch()}
        workshop={{
          canRun: canEditLevel,
          timer: (minutes) => diagramsApi.timer(d.id, minutes),
          voting: (body) => diagramsApi.voting(d.id, body),
          vote: (nodeId, on) => diagramsApi.vote(d.id, nodeId, on),
        }}
        banner={<ApprovalBanner id={d.id} state={state} level={d.level} />}
        live={{
          url: (since) => diagramsApi.liveUrl(d.id, since),
          changes: async (since) => (await diagramsApi.changes(d.id, since)).data,
          save: async (ops, clientId) => (await diagramsApi.saveOps(d.id, ops, clientId)).data,
          full: async () => {
            const res = await diagramsApi.get(d.id);
            return { content: res.data.content, seq: res.data.seq };
          },
        }}
        comments={{
          list: comments.data ?? [],
          canComment,
          add: async (input) => {
            await diagramsApi.comment(d.id, input);
            await comments.refetch();
          },
          resolve: async (commentId, resolved) => {
            await diagramsApi.resolve(d.id, commentId, resolved);
            await comments.refetch();
          },
          remove: async (commentId) => {
            await diagramsApi.removeComment(d.id, commentId);
            await comments.refetch();
          },
          canDelete: (c) => manage || c.author_id === d.me.id,
          setTask: async (commentId, task) => {
            await diagramsApi.setTask(d.id, commentId, task);
            await comments.refetch();
          },
          refresh: () => void comments.refetch(),
        }}
        onMeta={(meta) =>
          setD((x) => ({ ...x, ...(meta.name ? { name: meta.name } : {}), folder: meta.folder ?? x.folder }))
        }
        onLevel={(level) => setD((x) => ({ ...x, level: level as Diagram["level"] }))}
        preview={preview ? { ...preview, onExit: () => setPreview(null) } : null}
        title={({ name, canEdit }) => (
          <>
            <Link
              href={CUSTOMER_ROUTES.DIAGRAMS()}
              aria-label="All diagrams"
              className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Workflow className="text-primary hidden h-4 w-4 shrink-0 sm:block" />
            {renaming !== null ? (
              <input
                autoFocus
                value={renaming}
                maxLength={150}
                aria-label="Diagram name"
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={() => void rename(renaming)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") void rename(renaming);
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="border-primary bg-surface text-fg h-8 min-w-0 flex-1 rounded-md border px-2 text-sm font-semibold outline-none sm:max-w-80"
              />
            ) : (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setRenaming(name)}
                title={canEdit ? "Rename" : undefined}
                className={cn(
                  "text-fg min-w-0 truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold",
                  canEdit && "hover:bg-hover"
                )}
              >
                {name}
              </button>
            )}
            {d.folder && (
              <span className="text-fg-subtle hidden items-center gap-1 text-xs md:inline-flex">
                <Folder className="h-3.5 w-3.5" /> {d.folder}
              </span>
            )}
            {d.level === "view" && (
              <span className="bg-hover text-fg-subtle shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
                View only
              </span>
            )}
          </>
        )}
        sidePanel={{
          key: "history",
          label: "History",
          icon: Clock,
          render: (close) => (
            <History
              id={d.id}
              canEdit={d.level === "edit" || manage}
              onPreview={(content, label) => setPreview(content ? { content, label: label ?? "" } : null)}
              onRestored={() => setPreview(null)}
              onClose={() => {
                setPreview(null);
                close();
              }}
            />
          ),
        }}
        actions={
          manage && (
            <Button size="sm" leftIcon={Share2} onClick={() => setShareOpen(true)}>
              <span className="hidden sm:inline">Share</span>
            </Button>
          )
        }
        menu={[
          {
            label: d.starred ? "Remove from starred" : "Star",
            icon: Star,
            onClick: async () => {
              const res = await diagramsApi.star(d.id, !d.starred).catch((err) => {
                toast.error(errorMessage(err));
                return null;
              });
              if (res) {
                setD((x) => ({ ...x, starred: res.data.starred }));
                refreshList();
              }
            },
          },
          {
            label: "Move to folder",
            icon: Folder,
            hidden: d.level === "view" || d.level === "comment",
            onClick: () => setFolderOpen(true),
          },
          {
            label: "Make a copy",
            icon: Copy,
            onClick: async () => {
              try {
                const res = await diagramsApi.duplicate(d.id);
                toast.success("Copy made");
                refreshList();
                router.push(CUSTOMER_ROUTES.DIAGRAM(res.data.id));
              } catch (err) {
                toast.error(errorMessage(err));
              }
            },
          },
          {
            label: "Approve and lock",
            icon: BadgeCheck,
            hidden: !manage || state.locked,
            onClick: async () => {
              const ok = await confirm({
                title: "Approve and lock this diagram?",
                message:
                  "A copy is kept as the approved version, and nobody can change it until you unlock it. People who can edit can ask you to unlock it.",
                confirmLabel: "Approve",
                variant: "primary",
              });
              if (!ok) return;
              try {
                await diagramsApi.approve(d.id);
                toast.success("Approved and locked");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            },
          },
          { label: "Delete", icon: Trash2, danger: true, hidden: !manage, onClick: () => void remove() },
        ]}
      />
      {manage && shareOpen && (
        <ShareDialog
          diagram={{ ...d, pages: state.pages }}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onSaved={(next) => {
            setD((x) => ({
              ...x,
              team_access: next.team_access,
              link: next.link,
              members: next.members,
              embed: next.embed,
            }));
            refreshList();
          }}
        />
      )}
      <FolderDialog
        open={folderOpen}
        value={d.folder}
        onClose={() => setFolderOpen(false)}
        onSave={async (folder) => {
          const res = await diagramsApi.update(d.id, { folder });
          setD((x) => ({ ...x, folder: res.data.folder }));
          refreshList();
          toast.success(folder ? `Moved to ${folder}` : "Taken out of its folder");
        }}
      />
    </>
  );
}
