"use client";

import { memo, useEffect, type ReactNode } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Copy,
  CornerDownRight,
  Globe,
  List as ListIcon,
  Reply,
  Settings2,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { ChatBackdrop, TemplateBubble } from "../../../_components/whatsapp/TemplatePreview";
import type { BlockData, BlockType } from "../../../_lib/chatbotsApi";
import { triggerSummary } from "../../../_lib/chatbotsApi";
import { templatesApi } from "../../../_lib/templatesApi";
import { previewOf } from "../../../automation/_components/ReplyFields";
import { ACTION_LABELS, BLOCKS, fieldLabel, handlesOf, OPS, QUESTION_KINDS } from "./blocks";
import { useBuilder } from "./context";

export type FlowNode = Node<BlockData, BlockType>;

const HANDLE =
  "!h-3.5 !w-3.5 !border-2 !border-white !shadow-sm dark:!border-[#1f2937] transition-transform hover:!scale-125";

function handleTone(handle: string) {
  if (handle === "yes" || handle === "ok") return "!bg-emerald-500";
  if (handle === "no" || handle === "fail") return "!bg-red-500";
  if (handle === "invalid" || handle === "other") return "!bg-amber-500";
  if (handle.startsWith("b:") || handle.startsWith("r:")) return "!bg-violet-500";
  return "!bg-slate-500";
}

/** An output: a dot on the block's right edge, with how many people took it in analytics mode. */
function Out({ nodeId, handle, offset = 0 }: { nodeId: string; handle: string; offset?: number }) {
  const { report, testEdges } = useBuilder();
  const count = report?.edges[`${nodeId}|${handle}`];
  return (
    <>
      <Handle
        type="source"
        position={Position.Right}
        id={handle}
        style={{ right: -offset }}
        className={cn(HANDLE, handleTone(handle), testEdges.has(`${nodeId}|${handle}`) && "!bg-emerald-500")}
      />
      {report && (
        <span
          className="bg-fg text-page absolute top-1/2 z-10 -translate-y-1/2 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums"
          style={{ right: -offset - 36 }}
        >
          {count ?? 0}
        </span>
      )}
    </>
  );
}

/** A labelled output row under the block body (Answered, Any other reply, Yes / No…). */
function OutRow({
  nodeId,
  handle,
  icon: Icon,
  children,
  className,
}: {
  nodeId: string;
  handle: string;
  icon?: typeof Reply;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-fg-subtle relative flex items-center justify-end gap-1.5 border-t px-3 py-1.5 text-[11.5px] font-medium",
        "border-line",
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
      <Out nodeId={nodeId} handle={handle} />
    </div>
  );
}

function mediaUrl(key?: string | null) {
  return key ? templatesApi.sampleUrl(`/customer/templates/media/${key}`) : null;
}

function Bubble({ data, type }: { data: BlockData; type: BlockType }) {
  if (type === "message" && data.reply) {
    return <TemplateBubble {...previewOf(data.reply)} time="" />;
  }
  const media =
    type === "buttons" && ["image", "video", "document"].includes(data.header_type ?? "")
      ? { url: mediaUrl(data.media_key), filename: data.media_filename }
      : null;
  return (
    <TemplateBubble
      template={{
        header: {
          format: type === "buttons" ? (data.header_type ?? "none") : data.header ? "text" : "none",
          text: data.header ?? null,
        },
        body: data.text || "",
        footer: type === "question" ? null : (data.footer ?? null),
        buttons: [],
      }}
      media={media}
      time=""
    />
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-fg-faint px-1 text-xs italic">{children}</p>;
}

function Body({ id, type, data }: { id: string; type: BlockType; data: BlockData }) {
  const { chatbots, members, teams, trigger } = useBuilder();
  switch (type) {
    case "start":
      return (
        <div className="space-y-2 px-3 py-3">
          <p className="text-fg-subtle text-[11px] font-semibold tracking-wide uppercase">Starts when</p>
          <p className="text-fg text-sm leading-snug">{triggerSummary(trigger)}</p>
          {trigger.trigger === "keyword" && (
            <div className="flex flex-wrap gap-1">
              {trigger.keywords.slice(0, 6).map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
          <Out nodeId={id} handle="out" />
        </div>
      );
    case "message":
    case "buttons":
    case "list":
    case "question": {
      const noText = type === "message" ? !data.reply?.text && data.reply?.type === "text" : !data.text;
      return (
        <>
          <ChatBackdrop className="overflow-visible rounded-none px-3 py-3 pl-5">
            {noText ? (
              <Empty>Click to write the message</Empty>
            ) : (
              <div className="pointer-events-none">
                <Bubble data={data} type={type} />
              </div>
            )}
            {type === "buttons" && (
              <div className="mt-1 max-w-[290px] space-y-1">
                {(data.buttons ?? []).map((b) => (
                  <div
                    key={b.id}
                    className="relative flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[13px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] dark:bg-[#202c33] dark:text-[#53bdeb]"
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden />
                    <span className="truncate">{b.title || "Button"}</span>
                    <Out nodeId={id} handle={`b:${b.id}`} offset={12} />
                  </div>
                ))}
              </div>
            )}
            {type === "list" && (
              <div className="mt-1 max-w-[290px] overflow-hidden rounded-lg bg-white shadow-[0_1px_0.5px_rgba(11,20,26,.13)] dark:bg-[#202c33]">
                <div className="flex items-center justify-center gap-1.5 border-b border-black/[0.08] py-1.5 text-[13px] font-medium text-[#027eb5] dark:border-white/10 dark:text-[#53bdeb]">
                  <ListIcon className="h-3.5 w-3.5" aria-hidden />
                  {data.button || "Options"}
                </div>
                {(data.sections ?? []).map((s, si) => (
                  <div key={si}>
                    {s.title && (
                      <p className="px-2.5 pt-1.5 text-[10.5px] font-semibold text-[#008069] uppercase dark:text-[#00a884]">
                        {s.title}
                      </p>
                    )}
                    {s.rows.map((r) => (
                      <div key={r.id} className="relative px-2.5 py-1 text-[#111b21] dark:text-[#e9edef]">
                        <p className="truncate text-[12.5px]">{r.title || "Option"}</p>
                        {r.description && (
                          <p className="truncate text-[11px] text-[#667781] dark:text-[#8696a0]">
                            {r.description}
                          </p>
                        )}
                        <Out nodeId={id} handle={`r:${r.id}`} offset={12} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ChatBackdrop>
          {type === "question" && (
            <div className="border-line flex flex-wrap items-center gap-1.5 border-t px-3 py-2 text-[11.5px]">
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                {QUESTION_KINDS.find((k) => k.value === data.kind)?.label ?? "Any text"}
              </span>
              {data.variable ? (
                <span className="text-fg-subtle">
                  saved as <code className="text-fg font-mono">{`{{${data.variable}}}`}</code>
                  {data.save_to && data.save_to !== "none" && " + on the contact"}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">Name the answer</span>
              )}
            </div>
          )}
          {(type === "buttons" || type === "list") && (
            <>
              {data.variable && (
                <p className="text-fg-subtle border-line border-t px-3 py-1.5 text-[11.5px]">
                  Choice saved as <code className="text-fg font-mono">{`{{${data.variable}}}`}</code>
                </p>
              )}
              <OutRow nodeId={id} handle="other" icon={CornerDownRight}>
                Any other reply
              </OutRow>
            </>
          )}
          {type === "question" && (
            <>
              <OutRow nodeId={id} handle="out" icon={CheckCircle2}>
                Answered
              </OutRow>
              <OutRow nodeId={id} handle="invalid" icon={AlertTriangle}>
                Wrong answers
              </OutRow>
            </>
          )}
          {type === "message" && <Out nodeId={id} handle="out" />}
        </>
      );
    }
    case "condition":
      return (
        <>
          <div className="space-y-1.5 px-3 py-2.5">
            <p className="text-fg-subtle text-[11px] font-medium">
              {data.match === "any" ? "Any of these" : "All of these"}
            </p>
            {(data.rules ?? []).map((r, i) => (
              <p key={i} className="bg-page text-fg rounded-md px-2 py-1 text-[12px] leading-snug">
                <span className="font-semibold">{fieldLabel(r.field)}</span> {OPS[r.op] ?? r.op}{" "}
                {r.value && <span className="font-mono text-[11.5px]">“{r.value}”</span>}
              </p>
            ))}
          </div>
          <OutRow
            nodeId={id}
            handle="yes"
            icon={CheckCircle2}
            className="text-emerald-600 dark:text-emerald-400"
          >
            Yes
          </OutRow>
          <OutRow nodeId={id} handle="no" icon={XCircle} className="text-red-600 dark:text-red-400">
            No
          </OutRow>
        </>
      );
    case "action":
      return (
        <div className="space-y-1 px-3 py-2.5">
          {(data.actions ?? []).map((a, i) => (
            <p key={i} className="text-fg text-[12.5px] leading-snug">
              <span className="font-medium">{ACTION_LABELS[a.type]}</span>
              {a.tags?.length ? `: ${a.tags.join(", ")}` : ""}
              {a.key ? `: ${a.key}` : ""}
              {a.value ? ` = “${a.value}”` : ""}
            </p>
          ))}
          <Out nodeId={id} handle="out" />
        </div>
      );
    case "delay":
      return (
        <div className="px-3 py-2.5">
          <p className="text-fg text-sm">
            Waits{" "}
            <b>
              {data.amount} {data.amount === 1 ? data.unit?.replace(/s$/, "") : data.unit}
            </b>
          </p>
          <Out nodeId={id} handle="out" />
        </div>
      );
    case "webhook":
      return (
        <>
          <div className="space-y-1.5 px-3 py-2.5">
            <p className="flex min-w-0 items-center gap-1.5 text-[12px]">
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-cyan-700 dark:text-cyan-300">
                {data.method}
              </span>
              <span className="text-fg truncate font-mono">
                {(data.url ?? "").replace(/^https?:\/\//, "")}
              </span>
            </p>
            {(data.save ?? []).length > 0 && (
              <p className="text-fg-subtle text-[11.5px]">
                Saves {(data.save ?? []).map((s) => `{{${s.variable}}}`).join(", ")}
              </p>
            )}
          </div>
          <OutRow
            nodeId={id}
            handle="ok"
            icon={CheckCircle2}
            className="text-emerald-600 dark:text-emerald-400"
          >
            Success
          </OutRow>
          <OutRow nodeId={id} handle="fail" icon={XCircle} className="text-red-600 dark:text-red-400">
            Failure
          </OutRow>
        </>
      );
    case "handover": {
      const who =
        data.assign === "member"
          ? (members[data.member_id ?? 0] ?? "A person")
          : data.assign === "team"
            ? `Team ${teams[data.team_id ?? 0] ?? ""}`.trim()
            : data.assign === "nobody"
              ? "Unassigned (inbox)"
              : "Your assignment rules";
      return (
        <>
          {data.text && (
            <ChatBackdrop className="overflow-visible rounded-none px-3 py-3 pl-5">
              <div className="pointer-events-none">
                <TemplateBubble
                  template={{
                    header: { format: "none", text: null },
                    body: data.text,
                    footer: null,
                    buttons: [],
                  }}
                  time=""
                />
              </div>
            </ChatBackdrop>
          )}
          <p className="text-fg flex items-center gap-1.5 px-3 py-2.5 text-[12.5px]">
            <Users className="h-4 w-4 text-rose-500" aria-hidden /> To: <b className="truncate">{who}</b>
          </p>
        </>
      );
    }
    case "goto":
      return (
        <p className="text-fg px-3 py-2.5 text-[12.5px]">
          Continues in{" "}
          <b>
            {chatbots.find((c) => c.id === data.chatbot_id)?.name ??
              (data.chatbot_id ? "a deleted chatbot" : "…choose a chatbot")}
          </b>
        </p>
      );
    case "end":
      return (
        <>
          {data.text && (
            <ChatBackdrop className="overflow-visible rounded-none px-3 py-3 pl-5">
              <div className="pointer-events-none">
                <TemplateBubble
                  template={{
                    header: { format: "none", text: null },
                    body: data.text,
                    footer: null,
                    buttons: [],
                  }}
                  time=""
                />
              </div>
            </ChatBackdrop>
          )}
          <p className="text-fg-subtle px-3 py-2.5 text-[12px]">
            The chatbot ends here{data.resolve ? " and the chat is marked resolved" : ""}.
          </p>
        </>
      );
    default:
      return null;
  }
}

function BlockNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { problems, report, testNode, editable, edit, remove, duplicate, openSettings } = useBuilder();
  const info = BLOCKS[type];
  const updateInternals = useUpdateNodeInternals();
  const handleKey = handlesOf({ type, data })
    .map((h) => h.id)
    .join(",");
  useEffect(() => updateInternals(id), [handleKey, id, updateInternals]);
  const issues = problems[id];
  const stats = report?.nodes[id];
  const Icon = info.icon;

  return (
    <div
      className={cn(
        "group bg-surface relative w-[300px] rounded-2xl border shadow-md transition-shadow",
        selected ? "border-primary ring-primary/25 shadow-lg ring-4" : "border-line hover:shadow-lg",
        issues?.errors.length && !selected && "border-red-400 ring-2 ring-red-400/30",
        testNode === id && "ring-4 ring-emerald-400/60"
      )}
      data-testid={`block-${id}`}
      onDoubleClick={() => (type === "start" ? openSettings() : edit(id))}
    >
      {report && stats && (
        <div className="absolute -top-7 left-2 flex gap-1 text-[10.5px] font-semibold">
          <span className="bg-fg text-page rounded-full px-2 py-0.5 tabular-nums">
            {stats.reached} reached
          </span>
          {stats.dropped > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-white tabular-nums">
              {stats.dropped} left here
            </span>
          )}
        </div>
      )}
      {type !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(HANDLE, "!left-[-8px] !h-4 !w-4 !bg-slate-400")}
        />
      )}
      <div className="border-line flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", info.tone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="text-fg block truncate text-[13px] font-semibold">{data.label || info.label}</span>
          {data.label && <span className="text-fg-faint block text-[10.5px]">{info.label}</span>}
        </span>
        {issues?.errors.length ? (
          <span title={issues.errors.join("\n")} aria-label={`Problem: ${issues.errors[0]}`}>
            <CircleAlert className="h-4.5 w-4.5 text-red-500" />
          </span>
        ) : issues?.warnings.length ? (
          <span title={issues.warnings.join("\n")} aria-label={`Warning: ${issues.warnings[0]}`}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </span>
        ) : null}
        {editable && (
          <span className="nodrag flex opacity-0 transition group-hover:opacity-100 [.selected_&]:opacity-100">
            {type === "start" ? (
              <button
                type="button"
                onClick={openSettings}
                className="text-fg-subtle hover:text-fg hover:bg-page rounded-md p-1"
                aria-label="Change the trigger"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => duplicate(id)}
                  className="text-fg-subtle hover:text-fg hover:bg-page rounded-md p-1"
                  aria-label={`Duplicate ${data.label || info.label}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="text-fg-subtle hover:bg-page rounded-md p-1 hover:text-red-600"
                  aria-label={`Delete ${data.label || info.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <div className="overflow-visible rounded-b-2xl [&>*:last-child]:rounded-b-2xl">
        <Body id={id} type={type} data={data} />
      </div>
      {type === "webhook" && !data.url?.startsWith("http") && (
        <Globe className="absolute right-3 bottom-3 h-4 w-4 text-red-400" aria-hidden />
      )}
    </div>
  );
}

const Memo = memo(BlockNode);

export const NODE_TYPES = Object.fromEntries(Object.keys(BLOCKS).map((t) => [t, Memo]));
