"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge, Modal } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import { Segmented } from "./editor/parts";
import { CATEGORIES } from "./labels";
import { SAMPLES, type SampleTemplate } from "./samples";

function preview(s: SampleTemplate) {
  const t = s.template;
  if (t.category === "authentication") {
    return {
      template: {
        header: { format: "none", text: null },
        body: "*{{1}}* is your verification code. For your security, do not share this code.",
        footer: `This code expires in ${t.code_expiration_minutes ?? 10} minutes.`,
        buttons: [{ type: "otp", text: "Copy code" }],
      },
      values: { body: { "1": "123456" } },
    };
  }
  return { template: t, values: { body: t.examples } };
}

/** Ready-made templates to start from. */
export function LibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<"all" | SampleTemplate["template"]["category"]>("all");
  const shown = SAMPLES.filter((s) => category === "all" || s.template.category === category);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Template library"
      description="Start from a template written to Meta's rules. Change anything before you submit it."
    >
      <div className="mb-4">
        <Segmented
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All" },
            ...CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: c.icon })),
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={CUSTOMER_ROUTES.TEMPLATE_NEW()}
          className="border-line-strong/70 hover:border-primary hover:bg-primary-soft/40 flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition"
        >
          <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-full">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-fg text-sm font-semibold">Start from scratch</span>
          <span className="text-fg-subtle text-xs">A blank template</span>
        </Link>
        {shown.map((s) => {
          const p = preview(s);
          const cat = CATEGORIES.find((c) => c.value === s.template.category);
          return (
            <Link
              key={s.key}
              href={CUSTOMER_ROUTES.TEMPLATE_NEW({ sample: s.key })}
              aria-label={`Use the ${s.title} template`}
              className={cn(
                "group border-line bg-surface hover:border-primary flex flex-col overflow-hidden rounded-xl border text-left shadow-xs transition hover:shadow-md"
              )}
            >
              <ChatBackdrop className="pointer-events-none relative h-44 overflow-hidden rounded-none">
                <div className="origin-top-left scale-[0.78]">
                  <TemplateBubble template={p.template} values={p.values} highlight={false} />
                </div>
                <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#efeae2] dark:from-[#0b141a]" />
              </ChatBackdrop>
              <span className="flex items-start justify-between gap-2 p-3">
                <span className="min-w-0">
                  <span className="text-fg group-hover:text-primary block text-sm font-semibold">
                    {s.title}
                  </span>
                  <span className="text-fg-subtle block text-xs">{s.description}</span>
                </span>
                {cat && <Badge>{cat.label}</Badge>}
              </span>
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}
