"use client";

import { useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2, Play, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import { API_PATH, type EndpointSpec, type Method } from "../_content/types";
import { CodeTabs, JsonBlock } from "./Code";
import { useBaseUrl } from "./Inline";

export const METHOD_STYLE: Record<Method, string> = {
  GET: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  POST: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  PATCH: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  DELETE: "bg-red-500/12 text-red-700 dark:text-red-300",
};

export function MethodBadge({ method, className }: { method: Method; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wide",
        METHOD_STYLE[method],
        className
      )}
    >
      {method}
    </span>
  );
}

function fillPath(path: string, values: Record<string, string>) {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? `{${k}}`));
}

function samples(spec: EndpointSpec, base: string) {
  const qs = spec.query ? `?${new URLSearchParams(spec.query).toString()}` : "";
  const url = `${base}${fillPath(spec.path, spec.pathDefaults ?? {})}${qs}`;
  const body = spec.body ? JSON.stringify(spec.body, null, 2) : null;
  const bodyPy = spec.body
    ? JSON.stringify(spec.body, null, 4)
        .replace(/\btrue\b/g, "True")
        .replace(/\bfalse\b/g, "False")
        .replace(/\bnull\b/g, "None")
    : null;
  const curl = [
    `curl${spec.method === "GET" ? "" : ` -X ${spec.method}`} "${url}"`,
    `  -H "Authorization: Bearer YOUR_API_KEY"`,
    ...(body ? [`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(spec.body)}'`] : []),
  ].join(" \\\n");
  const js = [
    `const res = await fetch("${url}", {`,
    `  method: "${spec.method}",`,
    `  headers: {`,
    `    Authorization: "Bearer YOUR_API_KEY",`,
    ...(body ? [`    "Content-Type": "application/json",`] : []),
    `  },`,
    ...(body ? [`  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),`] : []),
    `});`,
    `const data = await res.json();`,
  ].join("\n");
  const python = [
    "import requests",
    "",
    `res = requests.${spec.method.toLowerCase()}(`,
    `    "${url}",`,
    `    headers={"Authorization": "Bearer YOUR_API_KEY"},`,
    ...(bodyPy ? [`    json=${bodyPy.replace(/\n/g, "\n    ")},`] : []),
    `)`,
    "print(res.json())",
  ].join("\n");
  const php = [
    "<?php",
    `$ch = curl_init("${url}");`,
    "curl_setopt_array($ch, [",
    `    CURLOPT_CUSTOMREQUEST => "${spec.method}",`,
    "    CURLOPT_RETURNTRANSFER => true,",
    `    CURLOPT_HTTPHEADER => ["Authorization: Bearer YOUR_API_KEY"${body ? ', "Content-Type: application/json"' : ""}],`,
    ...(body ? [`    CURLOPT_POSTFIELDS => json_encode(${phpArray(spec.body!, 1)}),`] : []),
    "]);",
    "$data = json_decode(curl_exec($ch), true);",
  ].join("\n");
  return [
    { label: "cURL", lang: "bash", code: curl },
    { label: "JavaScript", lang: "js", code: js },
    { label: "Python", lang: "python", code: python },
    { label: "PHP", lang: "php", code: php },
  ];
}

function phpArray(value: unknown, depth: number): string {
  const pad = "    ".repeat(depth + 1);
  const end = "    ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null))
      return `[${value.map((v) => phpArray(v, depth)).join(", ")}]`;
    return `[\n${value.map((v) => `${pad}${phpArray(v, depth + 1)}`).join(",\n")},\n${end}]`;
  }
  if (value && typeof value === "object") {
    const rows = Object.entries(value).map(([k, v]) => `${pad}"${k}" => ${phpArray(v, depth + 1)}`);
    return `[\n${rows.join(",\n")},\n${end}]`;
  }
  if (value === null) return "null";
  return JSON.stringify(value);
}

// The reader's API key for Try it: kept in this browser tab, or on this device if they choose.
const KEY = "cd_docs_api_key";
const KEY_EVENT = "cd-docs-key";
function readKey() {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribeKey(cb: () => void) {
  window.addEventListener(KEY_EVENT, cb);
  return () => window.removeEventListener(KEY_EVENT, cb);
}
function saveKey(value: string, remember: boolean) {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (value) (remember ? localStorage : sessionStorage).setItem(KEY, value);
  } catch {}
  window.dispatchEvent(new Event(KEY_EVENT));
}

const field =
  "border-line bg-surface text-fg placeholder:text-fg-faint focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2";

function TryIt({ spec }: { spec: EndpointSpec }) {
  const key = useSyncExternalStore(subscribeKey, readKey, () => "");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const pathKeys = [...spec.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const [pathValues, setPathValues] = useState<Record<string, string>>(spec.pathDefaults ?? {});
  const [query, setQuery] = useState<Record<string, string>>(spec.query ?? {});
  const [body, setBody] = useState(spec.body ? JSON.stringify(spec.body, null, 2) : "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: number; ms: number; data: unknown } | null>(null);
  const [error, setError] = useState("");
  const sends = spec.method === "POST" && spec.path === "/messages";

  const run = async () => {
    setError("");
    setResult(null);
    let parsed: unknown;
    if (spec.body) {
      try {
        parsed = JSON.parse(body);
      } catch {
        setError("The body isn't valid JSON. Check for a missing comma or quote.");
        return;
      }
    }
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== "")).toString();
    const url = `${API_PATH}${fillPath(spec.path, pathValues)}${qs ? `?${qs}` : ""}`;
    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: spec.method,
        headers: {
          Accept: "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(parsed !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: parsed !== undefined ? JSON.stringify(parsed) : undefined,
      });
      const data = await res.json().catch(() => ({ status: false, message: "The answer wasn't JSON" }));
      setResult({ status: res.status, ms: Math.round(performance.now() - started), data });
    } catch {
      setError("Couldn't reach the API. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="try-it" className="border-line bg-surface scroll-mt-32 overflow-hidden rounded-xl border">
      <div className="border-line bg-page/60 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-fg text-sm font-semibold">Try it</h2>
        <span className="text-fg-subtle text-[11px]">Real requests to your account</span>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <label htmlFor="try-key" className="text-fg mb-1 block text-xs font-medium">
            Your API key
          </label>
          <div className="flex gap-2">
            <input
              id="try-key"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="cdk_…"
              value={key}
              onChange={(e) => saveKey(e.target.value.trim(), remember)}
              className={field}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide key" : "Show key"}
              className="border-line text-fg-subtle hover:text-fg rounded-lg border px-2"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <label className="text-fg-subtle mt-1.5 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                saveKey(key, e.target.checked);
              }}
            />
            Remember on this device (otherwise forgotten when you close the tab)
          </label>
          <p className="text-fg-subtle mt-1 text-[11px]">
            Create one in ChatDesk → Settings → Integrations. It stays in your browser and is only sent to the
            API.
          </p>
        </div>

        {pathKeys.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {pathKeys.map((k) => (
              <div key={k}>
                <label htmlFor={`try-path-${k}`} className="text-fg mb-1 block text-xs font-medium">
                  {k} <span className="text-fg-faint font-normal">(in the URL)</span>
                </label>
                <input
                  id={`try-path-${k}`}
                  value={pathValues[k] ?? ""}
                  onChange={(e) => setPathValues({ ...pathValues, [k]: e.target.value })}
                  className={field}
                />
              </div>
            ))}
          </div>
        )}

        {spec.query && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.keys(spec.query).map((k) => (
              <div key={k}>
                <label htmlFor={`try-q-${k}`} className="text-fg mb-1 block text-xs font-medium">
                  {k} <span className="text-fg-faint font-normal">(optional)</span>
                </label>
                <input
                  id={`try-q-${k}`}
                  value={query[k] ?? ""}
                  onChange={(e) => setQuery({ ...query, [k]: e.target.value })}
                  className={field}
                />
              </div>
            ))}
          </div>
        )}

        {spec.body && (
          <div>
            <label htmlFor="try-body" className="text-fg mb-1 block text-xs font-medium">
              Body (JSON)
            </label>
            <textarea
              id="try-body"
              rows={Math.min(14, body.split("\n").length + 1)}
              spellCheck={false}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={cn(field, "leading-relaxed")}
            />
          </div>
        )}

        {/X{4,}/.test(`${JSON.stringify(pathValues)}${body}`) && (
          <p className="text-fg-subtle text-xs">
            Replace <code className="bg-page rounded px-1 font-mono">98XXXXXXXX</code> with a real WhatsApp
            number with its country code before sending.
          </p>
        )}
        {sends && (
          <p className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            This sends a real WhatsApp message. Use your own phone number while testing.
          </p>
        )}
        {error && <p className="text-danger text-xs">{error}</p>}

        <button
          type="button"
          onClick={run}
          disabled={busy || !key}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Send request
        </button>
        {!key && <span className="text-fg-subtle ml-3 text-xs">Paste your API key first</span>}

        {result && (
          <div aria-live="polite">
            <JsonBlock value={result.data} status={result.status} title={`Response · ${result.ms} ms`} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Endpoint({ spec }: { spec: EndpointSpec }) {
  const base = useBaseUrl();
  return (
    <div className="space-y-4">
      <div className="border-line bg-surface flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5">
        <MethodBadge method={spec.method} />
        <code className="text-fg min-w-0 truncate font-mono text-[13px]">
          <span className="text-fg-faint hidden sm:inline">{API_PATH}</span>
          {spec.path}
        </code>
      </div>
      <CodeTabs samples={samples(spec, base)} />
      <JsonBlock value={spec.response} title="Response" status={spec.status ?? 200} />
      <TryIt spec={spec} />
    </div>
  );
}
