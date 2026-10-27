"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

import { Input, Modal } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

const SHOWN = 120;
const POPULAR: IconName[] = [
  "user",
  "users",
  "message-circle",
  "phone",
  "mail",
  "shopping-cart",
  "package",
  "truck",
  "credit-card",
  "indian-rupee",
  "store",
  "calendar",
  "clock",
  "bell",
  "star",
  "heart",
  "check-circle",
  "x-circle",
  "alert-triangle",
  "settings",
  "server",
  "database",
  "cloud",
  "globe",
  "lock",
  "key",
  "file-text",
  "image",
  "megaphone",
  "bot",
  "zap",
  "rocket",
  "target",
  "trending-up",
  "bar-chart-3",
  "home",
];

/** Search the icon library (2,000+) and pick one. Icons load as they're shown. */
export function IconPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (name: IconName) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    if (!q) return POPULAR.filter((n) => (iconNames as readonly string[]).includes(n));
    const starts = iconNames.filter((n) => n.startsWith(q));
    const has = iconNames.filter((n) => !n.startsWith(q) && n.includes(q));
    return [...starts, ...has];
  }, [query]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an icon"
      description={`${iconNames.length.toLocaleString()} icons. Search in English, e.g. truck, payment, chat.`}
      size="lg"
    >
      <Input
        name="icon_search"
        leftIcon={Search}
        placeholder="Search icons"
        aria-label="Search icons"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="text-fg-subtle mt-3 mb-2 text-xs">
        {query.trim()
          ? `${results.length.toLocaleString()} found${results.length > SHOWN ? `, showing the first ${SHOWN}` : ""}`
          : "Popular"}
      </p>
      <div className="grid max-h-[50vh] grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
        {results.slice(0, SHOWN).map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={`Icon ${name.replace(/-/g, " ")}`}
            onClick={() => onPick(name)}
            className={cn(
              "hover:bg-hover text-fg-muted hover:text-fg flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition"
            )}
          >
            <DynamicIcon name={name} size={22} strokeWidth={1.75} />
            <span className="w-full truncate text-center text-[10px]">{name.replace(/-/g, " ")}</span>
          </button>
        ))}
        {!results.length && (
          <p className="text-fg-subtle col-span-full py-8 text-center text-sm">No icon matches “{query}”.</p>
        )}
      </div>
    </Modal>
  );
}
