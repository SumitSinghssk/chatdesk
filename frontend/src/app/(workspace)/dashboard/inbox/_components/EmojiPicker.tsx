"use client";

import { useRef, useState } from "react";
import { Briefcase, Coffee, Hand, Smile, type LucideIcon } from "lucide-react";

import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { cn } from "@/lib/utils";
import { Tooltip } from "../../_components/Tooltip";

// A compact, dependency-free set of the emoji people use most in customer chats.
const GROUPS: { label: string; icon: LucideIcon; emojis: string[] }[] = [
  {
    label: "Smileys",
    icon: Smile,
    emojis:
      "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😌 🤔 🤗 🤭 😐 😶 🙄 😬 😴 😷 🤒 😢 😭 😤 😠 😡 🤯 😳 🥺 😱".split(
        " "
      ),
  },
  {
    label: "Gestures & hearts",
    icon: Hand,
    emojis:
      "👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👋 💪 👀 ☝️ 👉 👈 👇 ✋ 🤚 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✨ 🔥 ⭐ 🌟 🎉 🎊 🎁 🏆".split(
        " "
      ),
  },
  {
    label: "Business",
    icon: Briefcase,
    emojis:
      "✅ ❌ ⚠️ ❗ ❓ ℹ️ 📞 📱 💬 📩 📧 📦 🚚 🛒 🛍️ 💳 💰 💵 🧾 📄 📎 📅 ⏰ ⏳ 📍 🏠 🏪 🔒 🔑 🎯 📈 📉 🆕 🆓 💡 🔔".split(
        " "
      ),
  },
  {
    label: "Food & things",
    icon: Coffee,
    emojis: "☕ 🍵 🍰 🎂 🍕 🍔 🍟 🍦 🍫 🍎 🥭 🍇 🌸 🌹 🌻 🌈 ☀️ 🌙 ⚡ 🎶 📸 🎥 👗 👕 👟 💍 💄 🧴 🧸 🎈".split(
      " "
    ),
  },
];

export function EmojiPicker({
  onPick,
  placement = "top",
}: {
  onPick: (emoji: string) => void;
  /** Where the panel opens; the chat composer sits at the bottom, so "top" by default. */
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <Tooltip label="Emoji" side={placement} align="start">
        <button
          type="button"
          aria-label="Emoji"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "text-fg-subtle hover:bg-hover hover:text-fg flex h-9 w-9 items-center justify-center rounded-lg transition",
            open && "bg-hover text-fg"
          )}
        >
          <Smile className="h-4.5 w-4.5" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className={cn(
            "popover-panel border-line bg-surface absolute left-0 z-50 w-72 rounded-xl border p-2 shadow-xl",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          {/* Icon tabs, one row that scrolls sideways if space runs out: never wraps */}
          <div
            role="tablist"
            aria-label="Emoji categories"
            className="no-scrollbar border-line mb-1.5 flex gap-1 overflow-x-auto border-b pb-1.5"
          >
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                role="tab"
                aria-selected={i === group}
                aria-label={g.label}
                title={g.label}
                onClick={() => setGroup(i)}
                className={cn(
                  "flex h-8 w-9 shrink-0 items-center justify-center rounded-md transition",
                  i === group ? "bg-primary-soft text-primary" : "text-fg-subtle hover:bg-hover hover:text-fg"
                )}
              >
                <g.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <p className="text-fg-faint px-1 pb-1 text-[10.5px] font-semibold tracking-wide whitespace-nowrap uppercase">
            {GROUPS[group]!.label}
          </p>
          <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
            {GROUPS[group]!.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className="hover:bg-hover flex h-8 w-8 items-center justify-center rounded-md text-lg"
                aria-label={`Insert ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
