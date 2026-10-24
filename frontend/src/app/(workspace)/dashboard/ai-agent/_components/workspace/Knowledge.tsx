"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  Globe,
  GraduationCap,
  HelpCircle,
  Loader2,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Input,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

import {
  AI_QK,
  aiAgentApi,
  compact,
  SOURCE_LABELS,
  type Agent,
  type SearchHit,
  type Source,
  type SourceKind,
} from "../../../_lib/aiAgentApi";
import { SourcePreview } from "./SourcePreview";

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.html,.htm,.json";

export function sourceIcon(s: Pick<Source, "kind" | "filename">): LucideIcon {
  if (s.kind === "url") return Globe;
  if (s.kind === "text") return StickyNote;
  if (s.kind === "faq") return HelpCircle;
  const ext = s.filename?.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "csv") return FileSpreadsheet;
  if (ext === "docx") return FileType2;
  return FileText;
}

type Adding = "files" | "url" | "text" | "faq";
type Upload = { name: string; state: "uploading" | "done" | "failed"; error?: string };

function AddKnowledge({
  agentId,
  faqPrefill,
  onFaqDone,
}: {
  agentId: number;
  faqPrefill: string | null;
  onFaqDone: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Adding>(faqPrefill ? "faq" : "files");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [crawl, setCrawl] = useState(true);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState(faqPrefill ?? "");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seenPrefill, setSeenPrefill] = useState(faqPrefill);
  if (faqPrefill !== seenPrefill) {
    setSeenPrefill(faqPrefill);
    if (faqPrefill) {
      setTab("faq");
      setQuestion(faqPrefill);
    }
  }
  const refresh = () => qc.invalidateQueries({ queryKey: AI_QK.AGENT(agentId) });

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploads((u) =>
      [...list.map((f) => ({ name: f.name, state: "uploading" as const })), ...u].slice(0, 12)
    );
    let ok = 0;
    for (const file of list) {
      try {
        await aiAgentApi.addFile(agentId, file);
        ok++;
        setUploads((u) =>
          u.map((x) => (x.name === file.name && x.state === "uploading" ? { ...x, state: "done" } : x))
        );
      } catch (err) {
        setUploads((u) =>
          u.map((x) =>
            x.name === file.name && x.state === "uploading"
              ? { ...x, state: "failed", error: errorMessage(err) }
              : x
          )
        );
      }
    }
    if (ok) toast.success(`${ok} file${ok > 1 ? "s" : ""} added. Train the agent when you're done.`);
    void refresh();
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (tab === "url") {
        const res = await aiAgentApi.addUrl(agentId, { url: url.trim(), crawl, max_pages: 15 });
        toast.success(res.message ?? "Page added");
        setUrl("");
      } else if (tab === "text") {
        await aiAgentApi.addText(agentId, { title: title.trim(), content: note.trim() });
        toast.success("Note added");
        setTitle("");
        setNote("");
      } else if (tab === "faq") {
        await aiAgentApi.addFaq(agentId, { question: question.trim(), answer: answer.trim() });
        toast.success("Question and answer added");
        setQuestion("");
        setAnswer("");
        onFaqDone();
      }
      void refresh();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { value: Adding; label: string; icon: LucideIcon }[] = [
    { value: "files", label: "Files", icon: UploadCloud },
    { value: "url", label: "Website", icon: Globe },
    { value: "text", label: "Note", icon: StickyNote },
    { value: "faq", label: "Q&A", icon: HelpCircle },
  ];
  return (
    <Card>
      <CardHeader
        icon={Plus}
        title="Add knowledge"
        description="Everything here is read once and remembered. Nothing is re-read for each question."
      />
      <div className="px-5 pb-5">
        <div className="bg-hover mb-4 grid grid-cols-4 gap-1 rounded-xl p-1" role="tablist" aria-label="Add">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm",
                tab === t.value ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        {tab === "files" ? (
          <div>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void upload(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                drag ? "border-primary bg-primary-soft" : "border-line hover:border-primary/50 hover:bg-hover"
              )}
            >
              <UploadCloud className="text-primary h-8 w-8" aria-hidden />
              <span className="text-fg text-sm font-semibold">Drop files here or click to choose</span>
              <span className="text-fg-subtle text-xs">
                PDF, Word, Excel, CSV, text, Markdown or HTML · up to 10 MB each · several at once
              </span>
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose files"
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
                e.target.value = "";
              }}
            />
            {uploads.length > 0 && (
              <ul className="mt-3 space-y-1.5" aria-label="Uploads">
                {uploads.map((u, i) => (
                  <li key={`${u.name}-${i}`} className="flex items-start gap-2 text-sm">
                    {u.state === "uploading" ? (
                      <Loader2 className="text-fg-subtle mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : u.state === "done" ? (
                      <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <AlertCircle className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="text-fg block truncate">{u.name}</span>
                      {u.error && <span className="text-danger block text-xs">{u.error}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {tab === "url" && (
              <>
                <Input
                  label="Page address"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://yourbusiness.com/about"
                  leftIcon={Globe}
                  error={errors.url}
                  required
                />
                <Checkbox
                  checked={crawl}
                  onChange={setCrawl}
                  label="Also add the other pages it links to on the same website (up to 15)"
                  hint="Login, cart and image links are skipped."
                />
              </>
            )}
            {tab === "text" && (
              <>
                <Input
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Delivery and returns"
                  required
                />
                <Textarea
                  label="Text"
                  rows={6}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Paste or type anything customers ask about: offers, policies, timings, menu…"
                  required
                />
              </>
            )}
            {tab === "faq" && (
              <>
                <Input
                  label="Question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Do you deliver on Sundays?"
                  required
                />
                <Textarea
                  label="Answer"
                  rows={4}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Yes, we deliver every day from 10 am to 8 pm."
                  required
                />
              </>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={busy} leftIcon={Plus}>
                {tab === "url"
                  ? busy
                    ? "Reading the website…"
                    : "Add website"
                  : tab === "text"
                    ? "Add note"
                    : "Add Q&A"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

function TrainBar({ agent, sources }: { agent: Agent; sources: Source[] }) {
  const qc = useQueryClient();
  const [training, setTraining] = useState(false);
  const k = agent.knowledge;
  const ready = sources.filter((s) => s.status === "ready" && s.enabled);
  const waiting = k.needs_training || (ready.length > 0 && !k.trained_at);
  const train = async () => {
    setTraining(true);
    try {
      const res = await aiAgentApi.train(agent.id);
      await qc.invalidateQueries({ queryKey: AI_QK.AGENT(agent.id) });
      await qc.invalidateQueries({ queryKey: AI_QK.AGENTS });
      toast.success(res.message ?? "Trained");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTraining(false);
    }
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
        waiting ? "border-warning/40 bg-warning-soft" : "border-line bg-surface"
      )}
      role="status"
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          waiting ? "bg-warning/15 text-warning" : "bg-success-soft text-success"
        )}
      >
        <GraduationCap className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-semibold">
          {waiting
            ? "New knowledge is waiting: train the agent to use it"
            : k.trained_at
              ? `Trained ${timeAgo(k.trained_at)} · version ${k.version}`
              : "Add knowledge, then train the agent"}
        </p>
        <p className="text-fg-subtle text-xs">
          {k.trained_at ? (
            <>
              ≈ {compact.format(k.tokens)} tokens of knowledge ·{" "}
              {k.mode === "full"
                ? "small enough to send all of it with every question, and the AI provider caches it (cheap and most accurate)"
                : "only the passages that match each question are sent, so replies stay cheap however much you add"}
            </>
          ) : (
            "Training reads every source once and builds the search index the agent answers from."
          )}
        </p>
      </div>
      <Button
        onClick={train}
        loading={training}
        leftIcon={GraduationCap}
        variant={waiting ? "primary" : "secondary"}
        disabled={!sources.length}
      >
        {waiting ? "Train now" : "Train again"}
      </Button>
    </div>
  );
}

function TrySearch({ agentId }: { agentId: number }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setHits((await aiAgentApi.search(agentId, q)).data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        icon={Search}
        title="Try a search"
        description="See which passages the agent would read for a question. Free: no AI is used."
      />
      <div className="px-5 pb-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Input
            aria-label="Search question"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. delivery charges"
            wrapperClassName="flex-1"
          />
          <Button type="submit" variant="secondary" loading={busy}>
            Search
          </Button>
        </form>
        {hits && (
          <ul className="mt-3 space-y-2" aria-label="Matching passages">
            {hits.length === 0 ? (
              <li className="text-fg-subtle text-sm">Nothing matches. Add a note or Q&A that answers it.</li>
            ) : (
              hits.slice(0, 5).map((h, i) => (
                <li key={i} className="border-line rounded-lg border p-2.5">
                  <p className="text-fg-subtle mb-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                    <span className="text-fg truncate">{h.title}</span>
                    {h.heading && <span className="truncate">· {h.heading}</span>}
                    <span className="ml-auto tabular-nums">match {h.score}</span>
                  </p>
                  <p className="text-fg line-clamp-3 text-sm">{h.text}</p>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Misses({ agentId, onAnswer }: { agentId: number; onAnswer: (question: string) => void }) {
  const misses = useQuery({
    queryKey: AI_QK.MISSES(agentId),
    queryFn: () => aiAgentApi.unanswered(agentId).then((r) => r.data),
  });
  const list = misses.data ?? [];
  if (!list.length) return null;
  const why = { unknown: "Didn't know", handover: "Handed over", disliked: "Rated bad" } as const;
  return (
    <Card>
      <CardHeader
        icon={MessageSquareWarning}
        title="Questions it couldn't answer"
        description="From the last 30 days. Add an answer and train, and it will know next time."
        badge={<Badge tone="warning">{list.length}</Badge>}
      />
      <ul className="divide-line divide-y" aria-label="Unanswered questions">
        {list.slice(0, 8).map((m) => (
          <li key={m.question} className="flex items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-fg text-sm">{m.question}</p>
              <p className="text-fg-subtle text-xs">
                {why[m.reason]} · asked {m.count}× · {timeAgo(m.last_at)}
              </p>
            </div>
            <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => onAnswer(m.question)}>
              Add answer
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Knowledge({ agent }: { agent: Agent }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Source | null>(null);
  const [faq, setFaq] = useState<string | null>(null);
  const sources = useQuery({
    queryKey: AI_QK.SOURCES(agent.id),
    queryFn: () => aiAgentApi.sources(agent.id).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === "pending") ? 2000 : false),
  });
  const all = sources.data ?? [];
  const shown = all.filter(
    (s) =>
      (kind === "all" || s.kind === kind) &&
      (!query || `${s.title} ${s.filename ?? ""} ${s.url ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  );
  const counts = all.reduce<Record<string, number>>((c, s) => ({ ...c, [s.kind]: (c[s.kind] ?? 0) + 1 }), {});
  const refresh = () => qc.invalidateQueries({ queryKey: AI_QK.AGENT(agent.id) });

  const toggle = async (s: Source, enabled: boolean) => {
    qc.setQueryData<Source[]>(AI_QK.SOURCES(agent.id), (old) =>
      old?.map((x) => (x.id === s.id ? { ...x, enabled } : x))
    );
    try {
      await aiAgentApi.updateSource(agent.id, s.id, { enabled });
    } catch (err) {
      toast.error(errorMessage(err));
    }
    void refresh();
  };
  const remove = async (s: Source) => {
    const ok = await confirm({
      title: `Remove “${s.title}”?`,
      message: "The agent forgets it after the next training.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await aiAgentApi.removeSource(agent.id, s.id);
      toast.success("Removed");
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const reread = async (s: Source) => {
    try {
      const res = await aiAgentApi.refreshSource(agent.id, s.id);
      if (res.data.status === "ready") toast.success("Page read again");
      else toast.error(res.data.error ?? "Couldn't read the page");
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const filters: { value: SourceKind | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "file", label: "Files" },
    { value: "url", label: "Web pages" },
    { value: "text", label: "Notes" },
    { value: "faq", label: "Q&A" },
  ];

  return (
    <div className="space-y-4">
      <TrainBar agent={agent} sources={all} />
      <AddKnowledge agentId={agent.id} faqPrefill={faq} onFaqDone={() => setFaq(null)} />
      <Card>
        <CardHeader
          icon={FileText}
          title="Knowledge"
          description={`${all.length} source${all.length === 1 ? "" : "s"} · click one to see exactly what the agent read`}
        />
        {all.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing yet"
            description="Upload your brochure, price list, menu or FAQ document, or add your website."
          />
        ) : (
          <>
            <div className="flex flex-col gap-2 px-5 pb-3 sm:flex-row sm:items-center">
              <div className="no-scrollbar flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Show">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === f.value}
                    onClick={() => setKind(f.value)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                      kind === f.value
                        ? "bg-primary text-primary-fg"
                        : "bg-hover text-fg-subtle hover:text-fg"
                    )}
                  >
                    {f.label}
                    {f.value !== "all" && counts[f.value] ? ` · ${counts[f.value]}` : ""}
                  </button>
                ))}
              </div>
              <Input
                aria-label="Search knowledge"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                leftIcon={Search}
                wrapperClassName="sm:ml-auto sm:w-56"
              />
            </div>
            <ul className="divide-line border-line divide-y border-t" aria-label="Knowledge sources">
              {shown.map((s) => {
                const Icon = sourceIcon(s);
                return (
                  <li
                    key={s.id}
                    className={cn("flex items-center gap-3 px-5 py-3", !s.enabled && "opacity-60")}
                  >
                    <span className="bg-hover text-fg-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <button
                      type="button"
                      onClick={() => s.status !== "pending" && setPreview(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-fg block truncate text-sm font-medium hover:underline">
                        {s.title}
                      </span>
                      <span className="text-fg-subtle block truncate text-xs">
                        {SOURCE_LABELS[s.kind]}
                        {s.kind === "url" && s.url ? ` · ${s.url.replace(/^https?:\/\//, "")}` : ""}
                        {s.size ? ` · ${formatBytes(s.size)}` : ""}
                        {s.pages ? ` · ${s.pages} pages` : ""}
                        {s.status === "ready" ? ` · ≈ ${compact.format(s.tokens)} tokens` : ""}
                        {` · ${timeAgo(s.created_at)}`}
                      </span>
                      {s.status === "failed" && (
                        <span className="text-danger block truncate text-xs">{s.error}</span>
                      )}
                    </button>
                    <span className="hidden shrink-0 sm:block">
                      {s.status === "pending" ? (
                        <Badge tone="info">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Reading
                        </Badge>
                      ) : s.status === "failed" ? (
                        <Badge tone="danger">Failed</Badge>
                      ) : s.enabled && !s.trained ? (
                        <Badge tone="warning">Not trained</Badge>
                      ) : s.enabled ? (
                        <Badge tone="success">Trained</Badge>
                      ) : (
                        <Badge>Off</Badge>
                      )}
                    </span>
                    <Switch
                      checked={s.enabled}
                      onChange={(v) => toggle(s, v)}
                      size="sm"
                      aria-label={`Use ${s.title}`}
                      disabled={s.status !== "ready"}
                    />
                    <span className="flex shrink-0">
                      {s.kind === "url" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          leftIcon={RefreshCw}
                          aria-label={`Read ${s.title} again`}
                          onClick={() => reread(s)}
                          className="hidden sm:inline-flex"
                        />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        leftIcon={Eye}
                        aria-label={`Preview ${s.title}`}
                        onClick={() => setPreview(s)}
                        disabled={s.status === "pending"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        leftIcon={Trash2}
                        aria-label={`Remove ${s.title}`}
                        onClick={() => remove(s)}
                      />
                    </span>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="text-fg-subtle px-5 py-6 text-center text-sm">No sources match.</li>
              )}
            </ul>
          </>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Misses
          agentId={agent.id}
          onAnswer={(q) => {
            setFaq(q);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        {agent.knowledge.trained_at && <TrySearch agentId={agent.id} />}
      </div>
      {preview && <SourcePreview agentId={agent.id} source={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
