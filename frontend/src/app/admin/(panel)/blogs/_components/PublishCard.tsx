import type { ReactNode } from "react";

import { Card, CardBody, CardHeader, DatePicker, Select } from "@/app/admin/_components/ui/index";
import { formatDateTime } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft", dot: "bg-amber-500" },
  { value: "published", label: "Published", dot: "bg-emerald-500" },
];

interface ControlledField {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export function PublishCard({
  statusField,
  publishedAtField,
  errors,
  canSave,
  isEdit,
  author,
  updatedAt,
  readOnlyNote,
}: {
  statusField: ControlledField;
  publishedAtField: ControlledField;
  errors: { status?: string; published_at?: string };
  canSave: boolean;
  isEdit: boolean;
  author?: string | null;
  updatedAt?: string | null;
  readOnlyNote?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title="Publish" />
      <CardBody className="space-y-4">
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status}
          disabled={!canSave}
          value={statusField.value}
          onChange={statusField.onChange}
          onBlur={statusField.onBlur}
        />
        <DatePicker
          withTime
          label="Publish date"
          placeholder="Publish immediately"
          hint="Leave blank to use the time it's published."
          error={errors.published_at}
          disabled={!canSave}
          value={publishedAtField.value}
          onChange={publishedAtField.onChange}
        />
        {isEdit && (
          <dl className="text-fg-subtle space-y-1 text-xs">
            {author && (
              <div className="flex justify-between gap-2">
                <dt>Author</dt>
                <dd className="text-fg font-medium">{author}</dd>
              </div>
            )}
            {updatedAt && (
              <div className="flex justify-between gap-2">
                <dt>Last updated</dt>
                <dd className="text-fg font-medium">{formatDateTime(updatedAt)}</dd>
              </div>
            )}
          </dl>
        )}
        {readOnlyNote}
      </CardBody>
    </Card>
  );
}
