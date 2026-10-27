"use client";

import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import { Eye, KeyRound, MessageSquare, Moon, Sun, Workflow } from "lucide-react";

import { Button, ErrorBanner, Input, Modal, Spinner } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { siteConfig } from "@/config/site";

import { sharedApi, type CommentInput, type SharedDiagram as Shared } from "../../_lib/diagramsApi";
import { Canvas } from "./editor/Canvas";

const PASS_KEY = (token: string) => `cd_diagram_pass:${token}`;
const NAME_KEY = "cd_diagram_guest_name";
const THEME_KEY = "sk_theme";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: it's only asked again next time */
  }
};

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = read(THEME_KEY);
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    setDark(isDark); // eslint-disable-line react-hooks/set-state-in-effect -- the saved theme is only known in the browser
  }, []);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    write(THEME_KEY, next ? "dark" : "light");
    setDark(next);
  };
  return { dark, toggle };
}

/** /d/<token>: a diagram someone shared by link. View, or view and comment; never edit. */
export function SharedDiagram({ token }: { token: string }) {
  const theme = useTheme();
  const [pass, setPass] = useState<string | null>(() =>
    typeof window === "undefined" ? null : read(PASS_KEY(token))
  );
  const query = useQuery({
    queryKey: ["shared-diagram", token, pass],
    queryFn: async () => (await sharedApi.get(token, pass)).data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const locked = query.error instanceof CustomerApiError && query.error.status === 401;

  return (
    <div className="bg-page flex h-dvh flex-col">
      {query.isLoading ? (
        <Spinner className="h-full" />
      ) : locked ? (
        <PasswordGate
          token={token}
          onUnlocked={(key) => {
            write(PASS_KEY(token), key);
            setPass(key);
          }}
        />
      ) : query.error || !query.data ? (
        <div className="mx-auto mt-24 w-full max-w-md p-4 text-center">
          <Workflow className="text-fg-faint mx-auto mb-3 h-8 w-8" />
          <h1 className="text-fg mb-2 text-lg font-semibold">This diagram can&apos;t be opened</h1>
          <ErrorBanner message={errorMessage(query.error ?? new Error("Not found"))} />
        </div>
      ) : (
        <ReactFlowProvider>
          <Viewer token={token} pass={pass} data={query.data} theme={theme} />
        </ReactFlowProvider>
      )}
    </div>
  );
}

function Viewer({
  token,
  pass,
  data,
  theme,
}: {
  token: string;
  pass: string | null;
  data: Shared;
  theme: { dark: boolean; toggle: () => void };
}) {
  const [access, setAccess] = useState(data.access);
  const [name, setName] = useState<string | null>(() => read(NAME_KEY));
  const [asking, setAsking] = useState(false);
  const waiting = useRef<((name: string | null) => void) | null>(null);
  const comments = useQuery({
    queryKey: ["shared-diagram", token, "comments"],
    queryFn: async () => (await sharedApi.comments(token, pass)).data,
    enabled: access === "comment",
    initialData: data.comments,
  });

  /** The guest's name, asked once (it goes on their comments). */
  const askName = () =>
    new Promise<string | null>((resolve) => {
      waiting.current = resolve;
      setAsking(true);
    });

  const add = async (input: CommentInput) => {
    const who = name ?? (await askName());
    if (!who) throw new Error("Add your name to comment");
    await sharedApi.comment(token, pass, { ...input, name: who });
    await comments.refetch();
  };

  return (
    <>
      <div className="min-h-0 flex-1">
        <Canvas
          name={data.name}
          content={data.content}
          seq={data.seq}
          level={access}
          me={{ id: null, name: name ?? "You", color: "#64748b", guest: true }}
          live={{
            url: (since) => sharedApi.liveUrl(token, since, pass, name),
            changes: async (since) => (await sharedApi.changes(token, pass, since)).data,
            full: async () => {
              const res = await sharedApi.get(token, pass);
              return { content: res.data.content, seq: res.data.seq };
            },
          }}
          comments={
            access === "comment"
              ? {
                  list: comments.data ?? [],
                  canComment: true,
                  add,
                  canDelete: () => false,
                  refresh: () => void comments.refetch(),
                }
              : null
          }
          onLevel={(level) => setAccess(level === "comment" ? "comment" : "view")}
          title={({ name: diagramName }) => (
            <>
              <a
                href={siteConfig.url}
                className="bg-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                aria-label={siteConfig.name}
              >
                {siteConfig.name.slice(0, 1)}
              </a>
              <h1 className="text-fg min-w-0 truncate text-sm font-semibold">{diagramName}</h1>
              <span className="bg-hover text-fg-subtle hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex">
                {access === "comment" ? <MessageSquare className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {access === "comment" ? "You can comment" : "View only"}
              </span>
            </>
          )}
          actions={
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              leftIcon={theme.dark ? Sun : Moon}
              aria-label={theme.dark ? "Light mode" : "Dark mode"}
              onClick={theme.toggle}
            />
          }
        />
      </div>
      <NameDialog
        open={asking}
        onDone={(value) => {
          setAsking(false);
          if (value) {
            write(NAME_KEY, value);
            setName(value);
          }
          waiting.current?.(value);
          waiting.current = null;
        }}
      />
    </>
  );
}

function NameDialog({ open, onDone }: { open: boolean; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <Modal
      open={open}
      onClose={() => onDone(null)}
      size="sm"
      title="Your name"
      description="It's shown with your comments, so the team knows who wrote them."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button disabled={!value.trim()} onClick={() => onDone(value.trim().slice(0, 60))}>
            Continue
          </Button>
        </div>
      }
    >
      <Input
        name="guest_name"
        label="Name"
        value={value}
        maxLength={60}
        autoFocus
        placeholder="e.g. Priya from Acme"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && onDone(value.trim().slice(0, 60))}
      />
    </Modal>
  );
}

function PasswordGate({ token, onUnlocked }: { token: string; onUnlocked: (pass: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="border-line bg-surface mx-auto mt-24 w-[calc(100%-2rem)] max-w-sm rounded-2xl border p-6 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const res = await sharedApi.unlock(token, password);
          if (res.data.pass) onUnlocked(res.data.pass);
        } catch (err) {
          setError(
            err instanceof CustomerApiError ? (err.errors.password ?? err.message) : errorMessage(err)
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="bg-primary-soft text-primary mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
        <KeyRound className="h-5 w-5" />
      </span>
      <h1 className="text-fg text-lg font-semibold">This diagram is protected</h1>
      <p className="text-fg-subtle mb-4 text-sm">Enter the password you were given.</p>
      <Input
        name="password"
        type="password"
        label="Password"
        value={password}
        autoFocus
        error={error}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" className="mt-4 w-full" loading={busy} disabled={!password}>
        Open
      </Button>
    </form>
  );
}
