"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Reply, Send, ShieldCheck } from "lucide-react";

import type { BlogCommentNode, BlogComments as BlogCommentsData } from "@/app/(website)/_lib/websiteApi";
import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";
import { BROWSER_API_BASE_URL } from "@/config/site";
import { cn, formatDate } from "@/lib/utils";

const AUTHOR_KEY = "sk_comment_author";

const input =
  "w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-base text-fg shadow-xs transition placeholder:text-fg-faint focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none";

type Errors = Partial<Record<"author_name" | "author_email" | "body" | "form", string>>;

export function BlogComments({ slug, data }: { slug: string; data: BlogCommentsData }) {
  const [replyTo, setReplyTo] = useState<number | null>(null);

  if (!data.enabled) return null;
  const canReply = data.open && data.allow_replies;

  return (
    <section id="comments" className="border-line border-t">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <h2 className="text-fg flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageCircle className="text-primary h-6 w-6" />
          {data.count ? `${data.count} ${data.count === 1 ? "comment" : "comments"}` : "Comments"}
        </h2>

        {data.items.length > 0 ? (
          <ol className="mt-8 space-y-6">
            {data.items.map((node) => (
              <CommentNode
                key={node.id}
                node={node}
                slug={slug}
                canReply={canReply}
                maxDepth={data.max_depth}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
              />
            ))}
          </ol>
        ) : (
          data.open && (
            <p className="text-fg-subtle mt-4">No comments yet. Be the first to share your thoughts.</p>
          )
        )}

        <div className="mt-10">
          {data.open ? (
            <div className="border-line bg-page rounded-2xl border p-5 sm:p-6">
              <h3 className="text-fg text-lg font-semibold">Leave a comment</h3>
              <p className="text-fg-subtle mt-1 mb-5 text-sm">
                Your email address will not be published. Comments appear after they are approved.
              </p>
              <CommentForm slug={slug} />
            </div>
          ) : (
            <p className="border-line bg-page text-fg-subtle rounded-xl border px-4 py-3 text-sm">
              Comments are closed for this post.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CommentNode({
  node,
  slug,
  canReply,
  maxDepth,
  replyTo,
  setReplyTo,
}: {
  node: BlogCommentNode;
  slug: string;
  canReply: boolean;
  maxDepth: number;
  replyTo: number | null;
  setReplyTo: (id: number | null) => void;
}) {
  const replying = replyTo === node.id;
  return (
    <li id={`comment-${node.id}`} className="scroll-mt-24">
      <div className="flex gap-3">
        <span
          aria-hidden
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            node.is_admin ? "bg-primary text-primary-fg" : "bg-primary-soft text-primary"
          )}
        >
          {node.author_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-fg font-semibold">{node.author_name}</span>
            {node.is_admin && (
              <span className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                <ShieldCheck className="h-3 w-3" /> Team
              </span>
            )}
            <time dateTime={node.created_at} suppressHydrationWarning className="text-fg-faint text-xs">
              {formatDate(node.created_at)}
            </time>
          </div>
          <p className="text-fg-muted mt-1.5 leading-relaxed break-words whitespace-pre-line">{node.body}</p>
          {canReply && node.depth < maxDepth && (
            <button
              type="button"
              onClick={() => setReplyTo(replying ? null : node.id)}
              aria-expanded={replying}
              className="text-primary mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              <Reply className="h-4 w-4" />
              {replying ? "Cancel reply" : "Reply"}
            </button>
          )}
          {replying && (
            <div className="border-line bg-page mt-3 rounded-xl border p-4">
              <p className="text-fg-subtle mb-3 text-sm">
                Replying to <b className="text-fg">{node.author_name}</b>
              </p>
              <CommentForm slug={slug} parentId={node.id} compact onCancel={() => setReplyTo(null)} />
            </div>
          )}
        </div>
      </div>

      {node.replies.length > 0 && (
        <ol className="border-line mt-5 ml-5 space-y-5 border-l pl-4 sm:ml-12 sm:pl-6">
          {node.replies.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              slug={slug}
              canReply={canReply}
              maxDepth={maxDepth}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function readAuthor(): { name: string; email: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTHOR_KEY) || "{}");
    return { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  } catch {
    return { name: "", email: "" };
  }
}

function CommentForm({
  slug,
  parentId,
  compact,
  onCancel,
}: {
  slug: string;
  parentId?: number;
  compact?: boolean;
  onCancel?: () => void;
}) {
  const startedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const prefix = parentId ? `reply-${parentId}` : "comment";

  useEffect(() => {
    startedAt.current = Date.now();
    const saved = readAuthor();
    const form = formRef.current;
    if (!form) return;
    const name = form.elements.namedItem("author_name") as HTMLInputElement | null;
    const email = form.elements.namedItem("author_email") as HTMLInputElement | null;
    if (name && !name.value) name.value = saved.name;
    if (email && !email.value) email.value = saved.email;
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Errors = {};
    if (data.author_name.trim().length < 2) next.author_name = "Please enter your name";
    if (!/^\S+@\S+\.\S+$/.test(data.author_email.trim())) next.author_email = "Please enter a valid email";
    if (data.body.trim().length < 2) next.body = "Please write a comment";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("sending");
    try {
      const res = await fetch(`${BROWSER_API_BASE_URL}${WEBSITE_ENDPOINTS.BLOG_COMMENTS(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          author_name: data.author_name,
          author_email: data.author_email,
          body: data.body,
          website: data.website,
          parent_id: parentId ?? null,
          started_at: startedAt.current,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldErrors = Object.fromEntries(
          Object.entries((json.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0]])
        );
        setErrors({ ...fieldErrors, form: json.message ?? "Something went wrong. Please try again." });
        setStatus("idle");
        return;
      }
      try {
        localStorage.setItem(
          AUTHOR_KEY,
          JSON.stringify({ name: data.author_name.trim(), email: data.author_email.trim() })
        );
      } catch {}
      setMessage(json.message ?? "Thanks! Your comment will appear once it has been approved.");
      setStatus("sent");
    } catch {
      setErrors({ form: "Can't reach the server. Please try again in a moment." });
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-fg font-semibold">{parentId ? "Reply received" : "Comment received"}</p>
          <p className="text-fg-subtle text-sm">{message}</p>
        </div>
      </div>
    );
  }

  const label = (id: string, text: string, required = true) => (
    <label htmlFor={id} className="text-fg-muted mb-1.5 block text-sm font-medium">
      {text}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
  const error = (key: keyof Errors) =>
    errors[key] && <p className="mt-1.5 text-sm text-red-600">{errors[key]}</p>;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${prefix}-website`}>Website</label>
        <input id={`${prefix}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        {label(`${prefix}-body`, parentId ? "Your reply" : "Comment")}
        <textarea
          id={`${prefix}-body`}
          name="body"
          rows={compact ? 3 : 5}
          maxLength={3000}
          className={cn(input, "resize-y", errors.body && "border-red-300")}
        />
        {error("body")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {label(`${prefix}-name`, "Name")}
          <input
            id={`${prefix}-name`}
            name="author_name"
            autoComplete="name"
            maxLength={120}
            className={cn(input, errors.author_name && "border-red-300")}
          />
          {error("author_name")}
        </div>
        <div>
          {label(`${prefix}-email`, "Email")}
          <input
            id={`${prefix}-email`}
            name="author_email"
            type="email"
            autoComplete="email"
            maxLength={255}
            className={cn(input, errors.author_email && "border-red-300")}
          />
          {error("author_email")}
        </div>
      </div>

      {errors.form && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
        >
          {errors.form}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "sending"}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60"
        >
          {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {parentId ? "Post reply" : "Post comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-subtle hover:text-fg text-sm font-medium"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
