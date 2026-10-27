"use client";

import { useEffect, useState } from "react";
import { Square, ThumbsUp, Timer, Vote, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Select } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import type { LiveState } from "../../../_lib/diagramsApi";

type Timer = NonNullable<LiveState["session"]["timer"]>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Seconds left on the shared timer (`endsAt`: when it ends on this device's clock). */
export function useRemaining(timer: Timer | null, endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    setNow(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect -- start from now, not from when the page opened
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [timer]);
  if (!timer) return null;
  // never more than the timer's length (the first frame, before the clock above catches up)
  return Math.min(timer.minutes * 60, Math.ceil(((endsAt ?? Date.parse(timer.ends_at)) - now) / 1000));
}

/** The countdown everyone in the diagram sees. */
export function TimerPill({ timer, endsAt }: { timer: Timer | null; endsAt: number | null }) {
  const left = useRemaining(timer, endsAt);
  if (!timer || left === null || left < -20) return null;
  const over = left <= 0;
  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute top-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-md",
        over
          ? "bg-danger animate-pulse text-white"
          : left <= 30
            ? "bg-amber-400 text-amber-950"
            : "bg-fg text-page"
      )}
    >
      <Timer className="h-4 w-4" />
      {over ? "Time's up!" : `${Math.floor(left / 60)}:${pad(left % 60)}`}
      <span className="text-xs font-normal opacity-75">· {timer.by}</span>
    </div>
  );
}

/** Timer and dot voting controls, and the results. */
export function WorkshopPanel({
  state,
  endsAt,
  me,
  canRun,
  canVote,
  labelOf,
  onFocus,
  onTimer,
  onVoting,
  onClose,
}: {
  state: LiveState;
  endsAt: number | null;
  me: string | null;
  canRun: boolean;
  canVote: boolean;
  labelOf: (nodeId: string) => string | null;
  onFocus: (nodeId: string) => void;
  onTimer: (minutes: number) => Promise<unknown>;
  onVoting: (body: { open: boolean; per_person?: number; reset?: boolean }) => Promise<unknown>;
  onClose: () => void;
}) {
  const { timer, voting } = state.session;
  const left = useRemaining(timer, endsAt);
  const [perPerson, setPerPerson] = useState(String(voting.per_person || 3));
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const used = me ? Object.values(voting.votes).filter((v) => v.includes(me)).length : 0;
  const results = Object.entries(voting.votes)
    .map(([id, voters]) => ({ id, count: voters.length, label: labelOf(id) }))
    .filter((r) => r.label !== null)
    .sort((a, b) => b.count - a.count);
  const total = results.reduce((s, r) => s + r.count, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line flex items-center justify-between border-b px-3 py-2.5">
        <p className="text-fg text-sm font-semibold">Workshop</p>
        <button
          type="button"
          aria-label="Close workshop"
          onClick={onClose}
          className="text-fg-subtle hover:bg-hover rounded-md p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <section className="space-y-2">
          <h3 className="text-fg flex items-center gap-1.5 text-[13px] font-semibold">
            <Timer className="text-fg-subtle h-4 w-4" /> Timer
          </h3>
          <p className="text-fg-subtle text-xs">Everyone here sees the same countdown.</p>
          {timer && left !== null && left > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg text-lg font-semibold tabular-nums">
                {Math.floor(left / 60)}:{pad(left % 60)}
              </span>
              {canRun && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={Square}
                  loading={busy === "stop"}
                  onClick={() => void run("stop", () => onTimer(0))}
                >
                  Stop
                </Button>
              )}
            </div>
          ) : canRun ? (
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 3, 5, 10].map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="secondary"
                  loading={busy === `t${m}`}
                  onClick={() => void run(`t${m}`, () => onTimer(m))}
                >
                  {m} min
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-fg-faint text-xs">No timer running.</p>
          )}
        </section>

        <section className="border-line space-y-2 border-t pt-4">
          <h3 className="text-fg flex items-center gap-1.5 text-[13px] font-semibold">
            <Vote className="text-fg-subtle h-4 w-4" /> Dot voting
          </h3>
          {voting.open ? (
            <>
              <p className="text-fg-subtle text-xs">
                Voting is open: tap the <ThumbsUp className="inline h-3 w-3" /> on a shape to vote.
                {canVote && (
                  <>
                    {" "}
                    You have <b className="text-fg">{Math.max(0, voting.per_person - used)}</b> of{" "}
                    {voting.per_person} votes left.
                  </>
                )}
              </p>
              {canRun && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === "end"}
                  onClick={() =>
                    void run("end", () => onVoting({ open: false, per_person: voting.per_person }))
                  }
                >
                  End voting
                </Button>
              )}
            </>
          ) : canRun ? (
            <div className="flex flex-wrap items-end gap-2">
              <Select
                id="votes-each"
                label="Votes each"
                size="sm"
                value={perPerson}
                onChange={setPerPerson}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                wrapperClassName="w-24"
              />
              <Button
                size="sm"
                loading={busy === "start"}
                onClick={() =>
                  void run("start", () =>
                    onVoting({ open: true, per_person: Number(perPerson), reset: true })
                  )
                }
              >
                Start voting
              </Button>
            </div>
          ) : (
            <p className="text-fg-faint text-xs">No vote running.</p>
          )}
          {results.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-fg-faint text-[10.5px] font-semibold tracking-wide uppercase">
                {voting.open ? "So far" : "Results"} · {total} vote{total === 1 ? "" : "s"}
              </p>
              <ol className="space-y-1">
                {results.slice(0, 10).map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onFocus(r.id)}
                      className="hover:bg-hover flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left"
                    >
                      <span className="text-fg-faint w-4 text-xs tabular-nums">{i + 1}</span>
                      <span className="text-fg min-w-0 flex-1 truncate text-[13px]">
                        {r.label || "Untitled shape"}
                      </span>
                      <span className="bg-hover h-1.5 w-16 overflow-hidden rounded-full">
                        <span
                          className="bg-primary block h-full rounded-full"
                          style={{ width: `${(r.count / results[0].count) * 100}%` }}
                        />
                      </span>
                      <span className="text-fg w-5 text-right text-xs font-semibold tabular-nums">
                        {r.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {canRun && !voting.open && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === "clear"}
                  onClick={() => void run("clear", () => onVoting({ open: false, reset: true }))}
                >
                  Clear the votes
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
