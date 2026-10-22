"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { mediaApi } from "@/app/admin/_lib/api/mediaApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn } from "@/lib/utils";

import { Field } from "./Field";

export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder = "Start writing…",
  error,
  required,
  folder = "editor",
}: {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  folder?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none dark:prose-invert px-4 py-3" },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const uploadImage = async (file: File | undefined) => {
    if (!file || !editor) return;
    try {
      const media = await mediaApi.upload(file, folder);
      editor.chain().focus().setImage({ src: media.url, alt: file.name }).run();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Image upload failed"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Field label={label} required={required} error={error}>
      <div
        className={cn(
          "bg-surface-2 overflow-hidden rounded-xl border shadow-xs",
          error
            ? "border-red-300"
            : "border-line-strong/80 focus-within:border-primary focus-within:ring-primary/15 focus-within:ring-3"
        )}
      >
        {editor && <Toolbar editor={editor} onImage={() => fileInput.current?.click()} />}
        <EditorContent editor={editor} className="max-h-[560px] overflow-y-auto" />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => uploadImage(e.target.files?.[0])}
        />
      </div>
    </Field>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const groups: { icon: LucideIcon; label: string; run: () => void; active?: boolean }[][] = [
    [
      {
        icon: Heading2,
        label: "Heading 2",
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        active: editor.isActive("heading", { level: 2 }),
      },
      {
        icon: Heading3,
        label: "Heading 3",
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        active: editor.isActive("heading", { level: 3 }),
      },
    ],
    [
      {
        icon: Bold,
        label: "Bold",
        run: () => editor.chain().focus().toggleBold().run(),
        active: editor.isActive("bold"),
      },
      {
        icon: Italic,
        label: "Italic",
        run: () => editor.chain().focus().toggleItalic().run(),
        active: editor.isActive("italic"),
      },
      {
        icon: UnderlineIcon,
        label: "Underline",
        run: () => editor.chain().focus().toggleUnderline().run(),
        active: editor.isActive("underline"),
      },
      {
        icon: Strikethrough,
        label: "Strikethrough",
        run: () => editor.chain().focus().toggleStrike().run(),
        active: editor.isActive("strike"),
      },
      {
        icon: Code,
        label: "Code",
        run: () => editor.chain().focus().toggleCode().run(),
        active: editor.isActive("code"),
      },
    ],
    [
      {
        icon: List,
        label: "Bullet list",
        run: () => editor.chain().focus().toggleBulletList().run(),
        active: editor.isActive("bulletList"),
      },
      {
        icon: ListOrdered,
        label: "Numbered list",
        run: () => editor.chain().focus().toggleOrderedList().run(),
        active: editor.isActive("orderedList"),
      },
      {
        icon: Quote,
        label: "Quote",
        run: () => editor.chain().focus().toggleBlockquote().run(),
        active: editor.isActive("blockquote"),
      },
      { icon: Minus, label: "Divider", run: () => editor.chain().focus().setHorizontalRule().run() },
    ],
    [
      {
        icon: AlignLeft,
        label: "Align left",
        run: () => editor.chain().focus().setTextAlign("left").run(),
        active: editor.isActive({ textAlign: "left" }),
      },
      {
        icon: AlignCenter,
        label: "Align center",
        run: () => editor.chain().focus().setTextAlign("center").run(),
        active: editor.isActive({ textAlign: "center" }),
      },
      {
        icon: AlignRight,
        label: "Align right",
        run: () => editor.chain().focus().setTextAlign("right").run(),
        active: editor.isActive({ textAlign: "right" }),
      },
    ],
    [
      { icon: Link2, label: "Link", run: setLink, active: editor.isActive("link") },
      { icon: ImagePlus, label: "Image", run: onImage },
    ],
    [
      { icon: Undo2, label: "Undo", run: () => editor.chain().focus().undo().run() },
      { icon: Redo2, label: "Redo", run: () => editor.chain().focus().redo().run() },
    ],
  ];

  return (
    <div className="border-line bg-page flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      {groups.map((group, gi) => (
        <div key={gi} className="border-line flex items-center gap-0.5 border-r pr-1 last:border-0">
          {group.map(({ icon: Icon, label, run, active }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={run}
              className={cn(
                "text-fg-subtle hover:bg-hover hover:text-fg flex h-7 w-7 items-center justify-center rounded-md transition",
                active && "bg-primary-soft text-primary"
              )}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
