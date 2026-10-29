"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, ListTodo, RotateCcw, Workflow } from "lucide-react";
import { toast } from "sonner";

import { Card, EmptyState, ErrorBanner, Skeleton } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { DIAGRAMS_QK, diagramsApi, type Task } from "../../_lib/diagramsApi";
import { dueText } from "./editor/Comments";

/** Comments given to this person as tasks, across every diagram: soonest due first. */
export function MyTasks() {
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const tasks = useQuery({ queryKey: DIAGRAMS_QK.TASKS(done), queryFn: () => diagramsApi.tasks(done) });
  const [busy, setBusy] = useState<number | null>(null);
  const toggle = async (t: Task) => {
    setBusy(t.id);
    try {
      await diagramsApi.resolve(t.diagram.id, t.id, !done);
      toast.success(done ? "Opened again" : "Done");
      await queryClient.invalidateQueries({ queryKey: ["diagrams", "tasks"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const items = tasks.data?.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="group" aria-label="Show">
        {[false, true].map((k) => (
          <button
            key={String(k)}
            type="button"
            aria-pressed={done === k}
            onClick={() => setDone(k)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              done === k ? "bg-primary-soft text-primary" : "text-fg-subtle hover:bg-hover"
            )}
          >
            {k ? "Done" : "To do"}
          </button>
        ))}
      </div>
      {tasks.error && <ErrorBanner message={errorMessage(tasks.error)} />}
      {tasks.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListTodo}
            title={done ? "Nothing done yet" : "No tasks for you"}
            description={
              done
                ? "Tasks you finish show here."
                : "When someone gives you a comment on a diagram as a task, it shows here with its due date."
            }
          />
        </Card>
      ) : (
        <Card className="divide-line divide-y overflow-hidden p-0">
          {items.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
              <button
                type="button"
                onClick={() => void toggle(t)}
                disabled={busy === t.id}
                aria-label={done ? "Open again" : "Mark done"}
                title={done ? "Open again" : "Mark done"}
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-line-strong hover:border-primary hover:text-primary text-transparent"
                )}
              >
                {done ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              </button>
              <Link
                href={`${CUSTOMER_ROUTES.DIAGRAM(t.diagram.id)}?comment=${t.id}`}
                className="group min-w-0 flex-1"
              >
                <p
                  className={cn(
                    "text-fg text-sm leading-snug break-words group-hover:underline",
                    done && "text-fg-subtle line-through"
                  )}
                >
                  {t.body}
                </p>
                <p className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="flex items-center gap-1">
                    <Workflow className="h-3.5 w-3.5" /> {t.diagram.name}
                  </span>
                  {t.task?.by && <span>· from {t.task.by}</span>}
                </p>
              </Link>
              {t.task?.due_on && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    t.overdue ? "bg-danger-soft text-danger" : "bg-hover text-fg-muted"
                  )}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t.overdue ? "Was due " : ""}
                  {dueText(t.task.due_on)}
                </span>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
