"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Copy,
  FileText,
  ImageIcon,
  Plus,
  Settings2,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Input,
  RadioGroup,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { TagInput } from "../../../_components/TagInput";
import type { BlockData, BotAction, ChatbotDetail, ConditionRule } from "../../../_lib/chatbotsApi";
import { triggerSummary } from "../../../_lib/chatbotsApi";
import { templatesApi } from "../../../_lib/templatesApi";
import { ReplyFields } from "../../../automation/_components/ReplyFields";
import { SAMPLE_ACCEPT } from "../../../templates/_components/editor/HeaderField";
import { Segmented } from "../../../templates/_components/editor/parts";
import {
  ACTION_LABELS,
  BLOCKS,
  BUILTIN_VARIABLES,
  FIELD_OPTIONS,
  needsValue,
  OPS,
  opsFor,
  QUESTION_KINDS,
  uid,
} from "./blocks";
import type { FlowNode } from "./nodes";

const varName = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);

/** Click a chip to put a {{variable}} at the end of a text. */
function VarChips({ vars, onPick }: { vars: string[]; onPick: (v: string) => void }) {
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-1">
      <span className="text-fg-faint mr-0.5 text-[11px]">Insert:</span>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(`{{${v}}}`)}
          className="bg-page border-line text-fg-subtle hover:border-primary hover:text-primary rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition"
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

const add = (text: string | null | undefined, v: string) =>
  `${(text ?? "").replace(/\s*$/, "")} ${v}`.trimStart();

function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-fg text-sm font-semibold">{title}</p>
        {hint && <p className="text-fg-subtle text-xs">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function MediaUpload({
  kind,
  value,
  filename,
  onChange,
}: {
  kind: "image" | "video" | "document";
  value?: string | null;
  filename?: string | null;
  onChange: (key: string, filename: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const Icon = kind === "document" ? FileText : kind === "video" ? Video : value ? ImageIcon : UploadCloud;
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={SAMPLE_ACCEPT[kind]}
        aria-label={`Header ${kind}`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const res = await templatesApi.uploadSample(file, kind);
            onChange(res.key, res.filename);
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="border-line-strong/70 hover:border-primary flex w-full items-center gap-3 rounded-lg border-2 border-dashed px-3 py-2.5 text-left transition"
      >
        {busy ? <Spinner className="py-0" /> : <Icon className="text-primary h-5 w-5 shrink-0" />}
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">
            {filename ?? `Upload the ${kind}`}
          </span>
          <span className="text-fg-subtle block text-xs">
            {value ? "Click to replace" : SAMPLE_ACCEPT[kind]}
          </span>
        </span>
      </button>
    </>
  );
}

type Set = (patch: Partial<BlockData>) => void;

function ButtonsForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  const buttons = data.buttons ?? [];
  const header = data.header_type ?? "none";
  return (
    <>
      <Textarea
        name="block_text"
        label="Message"
        rows={4}
        maxLength={1024}
        value={data.text ?? ""}
        placeholder="How can we help you today?"
        onChange={(e) => set({ text: e.target.value })}
      />
      <VarChips vars={vars} onPick={(v) => set({ text: add(data.text, v) })} />
      <Group title="Header" hint="Optional: bold text or a picture, video or PDF above the message.">
        <Segmented
          label="Header"
          value={header}
          onChange={(header_type) => set({ header_type })}
          options={[
            { value: "none", label: "None" },
            { value: "text", label: "Text" },
            { value: "image", label: "Image", icon: ImageIcon },
            { value: "video", label: "Video", icon: Video },
            { value: "document", label: "PDF", icon: FileText },
          ]}
        />
        {header === "text" && (
          <Input
            name="block_header"
            aria-label="Header text"
            maxLength={60}
            value={data.header ?? ""}
            onChange={(e) => set({ header: e.target.value })}
          />
        )}
        {(header === "image" || header === "video" || header === "document") && (
          <MediaUpload
            kind={header}
            value={data.media_key}
            filename={data.media_filename}
            onChange={(media_key, media_filename) => set({ media_key, media_filename })}
          />
        )}
      </Group>
      <Input
        name="block_footer"
        label="Footer"
        placeholder="Optional small grey text"
        maxLength={60}
        value={data.footer ?? ""}
        onChange={(e) => set({ footer: e.target.value })}
      />
      <Group
        title="Buttons"
        hint="Up to 3, 20 characters each. Connect each one to what should happen when it's tapped."
      >
        {buttons.map((b, i) => (
          <div key={b.id} className="flex gap-2">
            <Input
              name={`block_button_${i}`}
              aria-label={`Button ${i + 1}`}
              value={b.title}
              maxLength={20}
              onChange={(e) =>
                set({ buttons: buttons.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x)) })
              }
              rightAddon={<span className="text-fg-faint text-[11px] tabular-nums">{b.title.length}/20</span>}
              wrapperClassName="flex-1"
            />
            <Button
              variant="ghost"
              iconOnly
              leftIcon={Trash2}
              aria-label={`Remove button ${i + 1}`}
              disabled={buttons.length === 1}
              onClick={() => set({ buttons: buttons.filter((x) => x.id !== b.id) })}
            />
          </div>
        ))}
        {buttons.length < 3 && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Plus}
            onClick={() => set({ buttons: [...buttons, { id: uid(4), title: "" }] })}
          >
            Add button
          </Button>
        )}
      </Group>
      <Input
        name="block_variable"
        label="Save the tapped button as"
        placeholder="e.g. choice (optional)"
        value={data.variable ?? ""}
        onChange={(e) => set({ variable: varName(e.target.value) || null })}
        hint={data.variable ? `Use {{${data.variable}}} in later messages.` : undefined}
      />
    </>
  );
}

function ListForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  const sections = data.sections ?? [];
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const setSection = (i: number, patch: Partial<(typeof sections)[number]>) =>
    set({ sections: sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <Textarea
        name="block_text"
        label="Message"
        rows={3}
        maxLength={1024}
        value={data.text ?? ""}
        placeholder="Pick what you're looking for"
        onChange={(e) => set({ text: e.target.value })}
      />
      <VarChips vars={vars} onPick={(v) => set({ text: add(data.text, v) })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="block_header"
          label="Header"
          placeholder="Optional"
          maxLength={60}
          value={data.header ?? ""}
          onChange={(e) => set({ header: e.target.value })}
        />
        <Input
          name="block_footer"
          label="Footer"
          placeholder="Optional"
          maxLength={60}
          value={data.footer ?? ""}
          onChange={(e) => set({ footer: e.target.value })}
        />
      </div>
      <Input
        name="block_list_button"
        label="List button"
        maxLength={20}
        value={data.button ?? ""}
        placeholder="Options"
        onChange={(e) => set({ button: e.target.value })}
        hint="The button that opens the list."
      />
      <Group
        title={`Options (${total}/10)`}
        hint="Group them in sections if you like; each section needs a title then."
      >
        {sections.map((s, i) => (
          <div key={i} className="border-line space-y-2 rounded-xl border p-2.5">
            <div className="flex gap-2">
              <Input
                name={`block_section_${i}`}
                aria-label={`Section ${i + 1} title`}
                placeholder={sections.length > 1 ? "Section title" : "Section title (optional)"}
                maxLength={24}
                value={s.title ?? ""}
                onChange={(e) => setSection(i, { title: e.target.value })}
                wrapperClassName="flex-1"
              />
              {sections.length > 1 && (
                <Button
                  variant="ghost"
                  iconOnly
                  leftIcon={X}
                  aria-label={`Remove section ${i + 1}`}
                  onClick={() => set({ sections: sections.filter((_, j) => j !== i) })}
                />
              )}
            </div>
            {s.rows.map((r, k) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="space-y-1">
                  <Input
                    name={`block_row_${i}_${k}`}
                    aria-label={`Option ${k + 1} title`}
                    placeholder="Title"
                    maxLength={24}
                    value={r.title}
                    onChange={(e) =>
                      setSection(i, {
                        rows: s.rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)),
                      })
                    }
                  />
                  <Input
                    name={`block_row_${i}_${k}_description`}
                    aria-label={`Option ${k + 1} description`}
                    placeholder="Description (optional)"
                    maxLength={72}
                    value={r.description ?? ""}
                    onChange={(e) =>
                      setSection(i, {
                        rows: s.rows.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)),
                      })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  iconOnly
                  leftIcon={Trash2}
                  aria-label={`Remove option ${k + 1}`}
                  disabled={total === 1}
                  onClick={() => setSection(i, { rows: s.rows.filter((x) => x.id !== r.id) })}
                />
              </div>
            ))}
            {total < 10 && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Plus}
                onClick={() =>
                  setSection(i, { rows: [...s.rows, { id: uid(4), title: "", description: null }] })
                }
              >
                Add option
              </Button>
            )}
          </div>
        ))}
        {total < 10 && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Plus}
            onClick={() =>
              set({
                sections: [...sections, { title: "", rows: [{ id: uid(4), title: "", description: null }] }],
              })
            }
          >
            Add section
          </Button>
        )}
      </Group>
      <Input
        name="block_variable"
        label="Save the chosen option as"
        placeholder="e.g. category (optional)"
        value={data.variable ?? ""}
        onChange={(e) => set({ variable: varName(e.target.value) || null })}
        hint={data.variable ? `Use {{${data.variable}}} in later messages.` : undefined}
      />
    </>
  );
}

function QuestionForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  return (
    <>
      <Textarea
        name="block_text"
        label="Question"
        rows={3}
        maxLength={1024}
        value={data.text ?? ""}
        placeholder="What's your email address?"
        onChange={(e) => set({ text: e.target.value })}
      />
      <VarChips vars={vars} onPick={(v) => set({ text: add(data.text, v) })} />
      <Select
        label="Expected answer"
        value={data.kind ?? "text"}
        onChange={(kind) => set({ kind: kind as BlockData["kind"] })}
        options={QUESTION_KINDS.map((k) => ({ value: k.value, label: k.label }))}
        hint="Wrong answers (e.g. not an email) are asked again; see Settings for how many times."
      />
      {data.kind === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            name="block_min"
            label="Smallest"
            inputMode="decimal"
            value={data.min ?? ""}
            onChange={(e) => set({ min: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <Input
            name="block_max"
            label="Largest"
            inputMode="decimal"
            value={data.max ?? ""}
            onChange={(e) => set({ max: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      )}
      <Input
        name="block_variable"
        label="Save the answer as"
        placeholder="e.g. city"
        value={data.variable ?? ""}
        onChange={(e) => set({ variable: varName(e.target.value) })}
        hint={
          data.variable
            ? `Use {{${data.variable}}} in later messages and conditions.`
            : "Small letters, digits and _."
        }
      />
      <Select
        label="Also keep it on the contact"
        value={data.save_to ?? "none"}
        onChange={(save_to) => set({ save_to: save_to as BlockData["save_to"] })}
        options={[
          { value: "none", label: "No, only in this chat" },
          { value: "name", label: "As their name" },
          { value: "email", label: "As their email" },
          { value: "attribute", label: `As a contact field (${data.variable || "…"})` },
        ]}
      />
      <Textarea
        name="block_retry"
        label="Message for a wrong answer"
        rows={2}
        maxLength={1024}
        value={data.retry_text ?? ""}
        placeholder="Optional; we'll explain what's expected"
        onChange={(e) => set({ retry_text: e.target.value })}
      />
    </>
  );
}

function ConditionForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  const rules = data.rules ?? [];
  const setRule = (i: number, patch: Partial<ConditionRule>) =>
    set({ rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const fieldOptions = [
    ...vars
      .filter((v) => !BUILTIN_VARIABLES.includes(v))
      .map((v) => ({ value: `var:${v}`, label: `{{${v}}}`, group: "Answers" })),
    ...FIELD_OPTIONS,
    { value: "attr:", label: "A contact field…", group: "Contact" },
  ];
  return (
    <>
      <Segmented
        label="Match"
        value={data.match ?? "all"}
        onChange={(match) => set({ match })}
        options={[
          { value: "all", label: "All rules" },
          { value: "any", label: "Any rule" },
        ]}
      />
      {rules.map((r, i) => {
        const isAttr = r.field.startsWith("attr:");
        return (
          <div key={i} className="border-line space-y-2 rounded-xl border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle text-xs font-semibold">
                {i === 0 ? "If" : data.match === "any" ? "Or" : "And"}
              </span>
              {rules.length > 1 && (
                <Button
                  size="xs"
                  variant="ghost"
                  iconOnly
                  leftIcon={X}
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => set({ rules: rules.filter((_, j) => j !== i) })}
                />
              )}
            </div>
            <Select
              aria-label={`Rule ${i + 1}: what to check`}
              value={isAttr ? "attr:" : r.field}
              onChange={(field) =>
                setRule(i, {
                  field,
                  op: opsFor(field)[0],
                  value: field === "contact:opted_out" ? "yes" : r.value,
                })
              }
              options={fieldOptions}
              searchable
              size="sm"
            />
            {isAttr && (
              <Input
                name={`rule_${i}_key`}
                aria-label="Contact field name"
                placeholder="Field name, e.g. city"
                value={r.field.slice(5)}
                onChange={(e) => setRule(i, { field: `attr:${e.target.value.toLowerCase().slice(0, 40)}` })}
              />
            )}
            <Select
              aria-label={`Rule ${i + 1}: how`}
              value={r.op}
              onChange={(op) => setRule(i, { op })}
              options={opsFor(isAttr ? "attr:" : r.field).map((o) => ({ value: o, label: OPS[o] }))}
              size="sm"
            />
            {needsValue(r.op) && (
              <Input
                name={`rule_${i}_value`}
                aria-label={`Rule ${i + 1}: value`}
                placeholder={r.field === "tags" ? "vip, lead" : "Value"}
                value={r.value ?? ""}
                onChange={(e) => setRule(i, { value: e.target.value })}
                hint={
                  i === rules.length - 1
                    ? "Not case-sensitive. Separate several with commas to match any of them."
                    : undefined
                }
              />
            )}
          </div>
        );
      })}
      {rules.length < 10 && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={Plus}
          onClick={() => set({ rules: [...rules, { field: "message", op: "contains", value: "" }] })}
        >
          Add rule
        </Button>
      )}
      <p className="text-fg-faint text-xs">Connect the green dot for “yes” and the red one for “no”.</p>
    </>
  );
}

function ActionForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  const actions = data.actions ?? [];
  const setAction = (i: number, patch: Partial<BotAction>) =>
    set({ actions: actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <>
      {actions.map((a, i) => (
        <div key={i} className="border-line space-y-2 rounded-xl border p-2.5">
          <div className="flex gap-2">
            <Select
              aria-label={`Action ${i + 1}`}
              value={a.type}
              onChange={(type) =>
                setAction(i, { type: type as BotAction["type"], tags: [], key: null, value: null })
              }
              options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
              size="sm"
              wrapperClassName="flex-1"
            />
            {actions.length > 1 && (
              <Button
                variant="ghost"
                iconOnly
                leftIcon={X}
                aria-label={`Remove action ${i + 1}`}
                onClick={() => set({ actions: actions.filter((_, j) => j !== i) })}
              />
            )}
          </div>
          {(a.type === "add_tags" || a.type === "remove_tags") && (
            <TagInput
              id={`action-${i}-tags`}
              value={a.tags ?? []}
              onChange={(tags) => setAction(i, { tags })}
            />
          )}
          {(a.type === "set_attribute" || a.type === "set_variable") && (
            <Input
              name={`action_${i}_key`}
              aria-label="Name"
              placeholder={a.type === "set_variable" ? "variable_name" : "Field name, e.g. city"}
              value={a.key ?? ""}
              onChange={(e) =>
                setAction(i, { key: a.type === "set_variable" ? varName(e.target.value) : e.target.value })
              }
            />
          )}
          {["set_attribute", "set_variable", "set_name", "set_email"].includes(a.type) && (
            <>
              <Input
                name={`action_${i}_value`}
                aria-label="Value"
                placeholder="Value, e.g. {{city}}"
                value={a.value ?? ""}
                onChange={(e) => setAction(i, { value: e.target.value })}
              />
              <VarChips vars={vars} onPick={(v) => setAction(i, { value: add(a.value, v) })} />
            </>
          )}
        </div>
      ))}
      {actions.length < 10 && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={Plus}
          onClick={() => set({ actions: [...actions, { type: "add_tags", tags: [] }] })}
        >
          Add action
        </Button>
      )}
    </>
  );
}

function WebhookForm({ data, set, vars }: { data: BlockData; set: Set; vars: string[] }) {
  const headers = data.headers ?? [];
  const save = data.save ?? [];
  return (
    <>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
        <Select
          label="Method"
          value={data.method ?? "GET"}
          onChange={(method) => set({ method: method as BlockData["method"] })}
          options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))}
        />
        <Input
          name="block_url"
          label="Address"
          placeholder="https://api.example.com/orders/{{order_id}}"
          value={data.url ?? ""}
          onChange={(e) => set({ url: e.target.value.trim() })}
        />
      </div>
      <VarChips vars={vars} onPick={(v) => set({ url: `${data.url ?? ""}${v}` })} />
      <Group title="Headers" hint="For example Authorization: Bearer your-key">
        {headers.map((h, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2">
            <Input
              name={`header_${i}_key`}
              aria-label="Header name"
              placeholder="Name"
              value={h.key}
              onChange={(e) =>
                set({ headers: headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })
              }
            />
            <Input
              name={`header_${i}_value`}
              aria-label="Header value"
              placeholder="Value"
              value={h.value}
              onChange={(e) =>
                set({ headers: headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
              }
            />
            <Button
              variant="ghost"
              iconOnly
              leftIcon={Trash2}
              aria-label={`Remove header ${i + 1}`}
              onClick={() => set({ headers: headers.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {headers.length < 10 && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={Plus}
            onClick={() => set({ headers: [...headers, { key: "", value: "" }] })}
          >
            Add header
          </Button>
        )}
      </Group>
      {data.method !== "GET" && (
        <>
          <Textarea
            name="block_body"
            label="Body (JSON)"
            rows={4}
            className="font-mono text-xs"
            value={data.body ?? ""}
            placeholder={'{"phone": "{{phone}}", "order": "{{order_id}}"}'}
            onChange={(e) => set({ body: e.target.value })}
          />
          <VarChips vars={vars} onPick={(v) => set({ body: `${data.body ?? ""}${v}` })} />
        </>
      )}
      <Group
        title="Save from the answer"
        hint={
          <>
            Path in the JSON reply, e.g. <code>order.status</code> or <code>items.0.name</code>
          </>
        }
      >
        {save.map((s, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-2">
            <Input
              name={`save_${i}_path`}
              aria-label="Path"
              placeholder="order.status"
              value={s.path}
              onChange={(e) =>
                set({ save: save.map((x, j) => (j === i ? { ...x, path: e.target.value.trim() } : x)) })
              }
            />
            <Input
              name={`save_${i}_variable`}
              aria-label="Save as"
              placeholder="status"
              value={s.variable}
              onChange={(e) =>
                set({ save: save.map((x, j) => (j === i ? { ...x, variable: varName(e.target.value) } : x)) })
              }
            />
            <Button
              variant="ghost"
              iconOnly
              leftIcon={Trash2}
              aria-label={`Remove value ${i + 1}`}
              onClick={() => set({ save: save.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {save.length < 10 && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={Plus}
            onClick={() => set({ save: [...save, { path: "", variable: "" }] })}
          >
            Add value
          </Button>
        )}
      </Group>
      <p className="text-fg-faint text-xs">
        A 2xx answer goes to <b className="text-emerald-600">Success</b>; anything else, or no answer within 8
        seconds, goes to <b className="text-red-600">Failure</b>.
      </p>
    </>
  );
}

export function BlockEditor({
  node,
  bot,
  vars,
  issues,
  members,
  teams,
  onChange,
  onClose,
  onDelete,
  onDuplicate,
  onSettings,
}: {
  node: FlowNode;
  bot: ChatbotDetail;
  vars: string[];
  issues?: { errors: string[]; warnings: string[] };
  members: { value: number; label: string }[];
  teams: { value: number; label: string }[];
  onChange: (data: BlockData) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSettings: () => void;
}) {
  const info = BLOCKS[node.type as keyof typeof BLOCKS];
  const data = node.data;
  const set: Set = (patch) => onChange({ ...data, ...patch });
  const Icon = info.icon;

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Edit block">
      <div className="border-line flex items-center gap-2.5 border-b px-4 py-3">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", info.tone)}>
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">{info.label}</p>
          <p className="text-fg-subtle truncate text-xs">{info.description}</p>
        </div>
        <Button variant="ghost" iconOnly leftIcon={X} aria-label="Close" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {issues?.errors.map((e) => (
          <p
            key={e}
            className="flex gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {e}
          </p>
        ))}
        {issues?.warnings.map((w) => (
          <p
            key={w}
            className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
          </p>
        ))}
        {node.type !== "start" && (
          <Input
            name="block_label"
            label="Block name"
            placeholder={info.label}
            maxLength={40}
            value={data.label ?? ""}
            onChange={(e) => set({ label: e.target.value || null })}
            hint="Only you see it, on the canvas and in reports."
          />
        )}

        {node.type === "start" && (
          <div className="space-y-3">
            <p className="text-fg text-sm">{triggerSummary(bot)}</p>
            <Button variant="secondary" leftIcon={Settings2} onClick={onSettings}>
              Change the trigger
            </Button>
          </div>
        )}
        {node.type === "message" && (
          <>
            <ReplyFields
              reply={data.reply ?? { type: "text", text: "" }}
              onChange={(reply) => set({ reply })}
              types={["text", "media", "location"]}
              hint="*bold*, _italic_ and ~strike~ work like in WhatsApp."
            />
            {data.reply?.type !== "location" && (
              <VarChips
                vars={vars}
                onPick={(v) =>
                  set({ reply: { ...(data.reply ?? { type: "text" }), text: add(data.reply?.text, v) } })
                }
              />
            )}
          </>
        )}
        {node.type === "buttons" && <ButtonsForm data={data} set={set} vars={vars} />}
        {node.type === "list" && <ListForm data={data} set={set} vars={vars} />}
        {node.type === "question" && <QuestionForm data={data} set={set} vars={vars} />}
        {node.type === "condition" && <ConditionForm data={data} set={set} vars={vars} />}
        {node.type === "action" && <ActionForm data={data} set={set} vars={vars} />}
        {node.type === "webhook" && <WebhookForm data={data} set={set} vars={vars} />}
        {node.type === "delay" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                name="block_amount"
                label="Wait"
                type="number"
                min={1}
                max={720}
                value={data.amount ?? 1}
                onChange={(e) => set({ amount: Math.max(1, Math.min(720, Number(e.target.value) || 1)) })}
              />
              <Select
                label="Unit"
                value={data.unit ?? "seconds"}
                onChange={(unit) => set({ unit: unit as BlockData["unit"] })}
                options={[
                  { value: "seconds", label: "Seconds" },
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                ]}
              />
            </div>
            <p className="text-fg-faint text-xs">
              Up to 12 hours, so the chat stays inside WhatsApp&apos;s 24-hour window. Messages the customer
              sends meanwhile don&apos;t interrupt it (except your exit words, like “agent”).
            </p>
          </>
        )}
        {node.type === "handover" && (
          <>
            <Textarea
              name="block_text"
              label="Message before handing over"
              rows={3}
              maxLength={1024}
              value={data.text ?? ""}
              placeholder="Optional"
              onChange={(e) => set({ text: e.target.value || null })}
            />
            <RadioGroup
              label="Give the chat to"
              value={data.assign ?? "auto"}
              onChange={(assign) => set({ assign })}
              options={[
                {
                  value: "auto",
                  label: "Your assignment rules",
                  description: "Round-robin, as set on the Team page",
                },
                { value: "member", label: "A person" },
                { value: "team", label: "A team" },
                { value: "nobody", label: "Nobody: leave it in Unassigned" },
              ]}
            />
            {data.assign === "member" && (
              <Select
                label="Person"
                value={data.member_id ?? null}
                onChange={(v) => set({ member_id: Number(v) })}
                options={members}
                placeholder="Choose…"
              />
            )}
            {data.assign === "team" && (
              <Select
                label="Team"
                value={data.team_id ?? null}
                onChange={(v) => set({ team_id: Number(v) })}
                options={teams}
                placeholder={teams.length ? "Choose…" : "Create teams on the Team page"}
              />
            )}
            <p className="text-fg-faint text-xs">
              The chatbot stops; the chat waits for your team in the inbox.
            </p>
          </>
        )}
        {node.type === "goto" && (
          <Select
            label="Continue in"
            value={data.chatbot_id ?? null}
            onChange={(v) => set({ chatbot_id: Number(v) })}
            options={bot.chatbots.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={bot.chatbots.length ? "Choose a chatbot…" : "Create another chatbot first"}
            hint="It starts from that chatbot's Start block; answers saved so far come along."
          />
        )}
        {node.type === "end" && (
          <>
            <Textarea
              name="block_text"
              label="Last message"
              rows={3}
              maxLength={1024}
              value={data.text ?? ""}
              placeholder="Optional, e.g. Thanks! Have a great day."
              onChange={(e) => set({ text: e.target.value || null })}
            />
            <Switch
              checked={!!data.resolve}
              onChange={(resolve) => set({ resolve })}
              label="Mark the chat resolved"
            />
          </>
        )}
      </div>
      {node.type !== "start" && (
        <div className="border-line flex gap-2 border-t px-4 py-3">
          <Button variant="secondary" size="sm" leftIcon={Copy} onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button variant="danger-outline" size="sm" leftIcon={Trash2} onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
