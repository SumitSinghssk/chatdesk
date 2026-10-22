"use client";

import { useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  type Updater,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  EyeOff,
  GripVertical,
  LayoutGrid,
  List,
  ListFilter,
  MoreVertical,
  RotateCcw,
  Rows3,
  Table2,
  X,
} from "lucide-react";

import type { BulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { cn } from "@/lib/utils";

import { Checkbox } from "../ui/Checkbox";
import { EmptyState, Skeleton } from "../ui/Feedback";
import { ToolbarSearch } from "../ui/ListToolbar";
import { Tooltip } from "../ui/Tooltip";
import { usePopover } from "../ui/usePopover";
import { FilterPanel } from "./FilterPanel";
import { GridPopover, MenuItem, ToolbarIconButton } from "./GridPopover";
import { describeRule } from "./operators";
import type { Density, FilterRule, GridColumn, GridView, RowSlots, SortRule } from "./types";
import { useGridPrefs, type useGridUrlState } from "./useGridState";

const INTERACTIVE =
  "a, button, input, textarea, label, [role=button], [role=switch], [role=checkbox], [role=menuitem]";
const alwaysSelectable = () => true;
const SELECT_W = 44;

const DENSITY: Record<Density, { cell: string; text: string; label: string }> = {
  compact: { cell: "py-1.5", text: "text-[13px]", label: "Compact" },
  standard: { cell: "py-2.5", text: "text-sm", label: "Standard" },
  comfortable: { cell: "py-3.5", text: "text-sm", label: "Comfortable" },
};

export function DataGrid<T>({
  id,
  columns,
  rows,
  getRowId,
  loading,
  fetching,
  grid,
  search,
  onSearch,
  searchPlaceholder,
  toolbar,
  actions,
  count,
  countLabel = "results",
  selection,
  onRowClick,
  highlightId,
  empty,
  footer,
  renderListItem,
  renderCard,
  defaultView = "table",
  isSelectable = alwaysSelectable,
  cardGridClassName,
}: {
  id: string;
  columns: GridColumn<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => number;
  loading?: boolean;
  fetching?: boolean;
  grid: ReturnType<typeof useGridUrlState>;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  actions?: ReactNode;
  count?: number;
  countLabel?: string;
  selection?: BulkSelection;
  onRowClick?: (row: T) => void;
  highlightId?: number | null;
  empty?: ReactNode;
  footer?: ReactNode;
  renderListItem?: (row: T, slots: RowSlots) => ReactNode;
  renderCard?: (row: T, slots: RowSlots) => ReactNode;
  isSelectable?: (row: T) => boolean;
  cardGridClassName?: string;
  defaultView?: GridView;
}) {
  const [prefs, savePrefs] = useGridPrefs(id);
  const density = prefs.density ?? "standard";
  const views: GridView[] = [
    "table",
    ...(renderListItem ? (["list"] as const) : []),
    ...(renderCard ? (["cards"] as const) : []),
  ];
  const view: GridView =
    prefs.view && views.includes(prefs.view)
      ? prefs.view
      : views.includes(defaultView)
        ? defaultView
        : "table";
  const [filterSeed, setFilterSeed] = useState<{ n: number; column?: string }>({ n: 0 });
  const [dragCol, setDragCol] = useState<string | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const columnVisibility = useMemo(() => {
    const vis: Record<string, boolean> = {};
    for (const c of columns) {
      const hidden = c.defaultHidden ? !prefs.shown?.includes(c.id) : !!prefs.hidden?.includes(c.id);
      vis[c.id] = c.alwaysVisible || !hidden;
    }
    return vis;
  }, [columns, prefs.hidden, prefs.shown]);

  const columnOrder = useMemo(() => {
    const saved = (prefs.order ?? []).filter((c) => byId.has(c));
    return [...saved, ...columns.map((c) => c.id).filter((c) => !saved.includes(c))];
  }, [prefs.order, columns, byId]);

  const columnSizing = useMemo<ColumnSizingState>(() => prefs.sizes ?? {}, [prefs.sizes]);

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        cell: (info) => c.cell(info.row.original),
        size: c.size ?? 160,
        minSize: c.minSize ?? 80,
        enableHiding: !c.alwaysVisible,
      })),
    [columns]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows ?? [],
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(getRowId(r)),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    columnResizeMode: "onChange",
    state: { columnVisibility, columnOrder, columnSizing },
    onColumnSizingChange: (updater: Updater<ColumnSizingState>) =>
      savePrefs({ sizes: typeof updater === "function" ? updater(columnSizing) : updater }),
  });

  const sortOf = (colId: string) => grid.sort.findIndex((s) => s.id === colId);
  const setColumnSort = (colId: string, dir: "asc" | "desc" | null, multi = false) => {
    const rest = multi ? grid.sort.filter((s) => s.id !== colId) : [];
    grid.setSort(dir ? [...rest, { id: colId, desc: dir === "desc" }].slice(-3) : rest);
  };
  const cycleSort = (colId: string, multi: boolean) => {
    const current = grid.sort.find((s) => s.id === colId);
    setColumnSort(colId, !current ? "asc" : !current.desc ? "desc" : null, multi);
  };

  const setVisible = (colId: string, visible: boolean) => {
    const c = byId.get(colId);
    if (!c) return;
    if (c.defaultHidden) {
      const shown = new Set(prefs.shown ?? []);
      if (visible) shown.add(colId);
      else shown.delete(colId);
      savePrefs({ shown: [...shown] });
    } else {
      const hidden = new Set(prefs.hidden ?? []);
      if (visible) hidden.delete(colId);
      else hidden.add(colId);
      savePrefs({ hidden: [...hidden] });
    }
  };

  const moveColumn = (from: string, to: string) => {
    if (from === to) return;
    const order = columnOrder.filter((c) => c !== from);
    order.splice(order.indexOf(to), 0, from);
    savePrefs({ order });
  };

  const removeRule = (rule: FilterRule) => grid.setFilters(grid.filters.filter((r) => r.id !== rule.id));

  const visibleHeaders = table.getHeaderGroups()[0]?.headers ?? [];
  const firstId = visibleHeaders[0]?.column.id;
  const d = DENSITY[density];
  const totalWidth = table.getTotalSize() + (selection ? SELECT_W : 0);
  const selectableIds = (rows ?? []).filter(isSelectable).map(getRowId);
  const pageState = selection?.pageState(selectableIds) ?? "none";

  const tableClass = cn("border-separate border-spacing-0 text-left", d.text);
  const tableStyle = { width: totalWidth, minWidth: "100%", tableLayout: "fixed" } as const;
  const colgroup = (
    <colgroup>
      {selection && <col style={{ width: SELECT_W }} />}
      {visibleHeaders.map((h) => (
        <col key={h.id} style={{ width: h.getSize() }} />
      ))}
    </colgroup>
  );

  const syncScroll = (e: UIEvent<HTMLDivElement>) => {
    const x = e.currentTarget.scrollLeft;
    for (const el of [headRef.current, bodyRef.current, barRef.current]) {
      if (el && el !== e.currentTarget && el.scrollLeft !== x) el.scrollLeft = x;
    }
  };

  return (
    <div className="min-w-0">
      <div className="border-line flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {count !== undefined && (
            <p className="text-fg-subtle truncate text-sm">
              <b className="text-fg font-semibold tabular-nums">{count.toLocaleString()}</b> {countLabel}
            </p>
          )}
          {toolbar}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onSearch && (
            <Tooltip label="Search">
              <ToolbarSearch value={search ?? ""} onChange={onSearch} placeholder={searchPlaceholder} />
            </Tooltip>
          )}
          <FilterPanel
            columns={columns}
            applied={grid.filters}
            match={grid.match}
            onApply={grid.setFilters}
            seed={filterSeed}
          />
          {view === "table" ? (
            <ColumnsMenu
              columns={columnOrder.map((cid) => byId.get(cid)!).filter(Boolean)}
              visibility={columnVisibility}
              onToggle={setVisible}
              onReset={() => savePrefs(null)}
            />
          ) : (
            <SortMenu columns={columns} sort={grid.sort} onSort={(id, dir) => setColumnSort(id, dir)} />
          )}
          {view !== "cards" && <DensityMenu value={density} onChange={(v) => savePrefs({ density: v })} />}
          {views.length > 1 && (
            <ViewSwitch views={views} value={view} onChange={(v) => savePrefs({ view: v })} />
          )}
          {actions && (
            <>
              <span className="bg-line mx-0.5 hidden h-6 w-px sm:block" aria-hidden />
              {actions}
            </>
          )}
        </div>
      </div>

      {(grid.filters.length > 0 || grid.sort.length > 0) && (
        <div className="border-line bg-page/50 flex flex-wrap items-center gap-1.5 border-b px-3 py-2 sm:px-4">
          {grid.filters.map((rule, i) => {
            const chip = describeRule(rule, byId.get(rule.field));
            return (
              <span key={rule.id} className="contents">
                {i > 0 && (
                  <span className="text-fg-faint text-[11px] font-semibold uppercase">{grid.match}</span>
                )}
                <span className="border-primary/25 bg-primary-soft text-primary inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs">
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => setFilterSeed((s) => ({ n: s.n + 1 }))}
                  >
                    <b className="font-semibold">{chip.field}</b> {chip.op}{" "}
                    {chip.value && <b className="font-semibold">{chip.value}</b>}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove filter on ${chip.field}`}
                    onClick={() => removeRule(rule)}
                    className="hover:bg-primary/15 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </span>
            );
          })}
          {grid.sort.map((s, i) => (
            <span
              key={s.id}
              className="border-line bg-surface text-fg-muted inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
            >
              {s.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {grid.sort.length > 1 && <span className="text-fg-faint">{i + 1}.</span>}
              {byId.get(s.id)?.header ?? s.id}
              <button
                type="button"
                aria-label="Remove sort"
                onClick={() => setColumnSort(s.id, null, true)}
                className="hover:bg-hover rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              grid.setFilters([]);
              grid.setSort([]);
            }}
            className="text-fg-subtle hover:text-fg ml-1 text-xs font-medium"
          >
            Clear all
          </button>
        </div>
      )}

      {view === "table" ? (
        <>
          <div ref={headRef} className="bg-page sticky top-0 z-20 overflow-hidden">
            {fetching && !loading && (
              <div className="grid-progress bg-primary/20 absolute inset-x-0 bottom-0 z-30 h-0.5 overflow-hidden" />
            )}
            <table className={tableClass} style={tableStyle}>
              {colgroup}
              <thead>
                <tr>
                  {selection && (
                    <th
                      style={{ width: SELECT_W, left: 0 }}
                      className="border-line bg-page sticky z-10 border-b px-3 py-2"
                    >
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={pageState === "all"}
                        indeterminate={pageState === "some"}
                        disabled={selectableIds.length === 0}
                        onChange={() => selection.togglePage(selectableIds)}
                      />
                    </th>
                  )}
                  {visibleHeaders.map((header) => (
                    <HeaderCell
                      key={header.id}
                      header={header}
                      column={byId.get(header.column.id)!}
                      pinned={header.column.id === firstId}
                      pinLeft={selection ? SELECT_W : 0}
                      sortIndex={sortOf(header.column.id)}
                      sortDesc={grid.sort.find((s) => s.id === header.column.id)?.desc}
                      multiSort={grid.sort.length > 1}
                      onSort={(multi) => cycleSort(header.column.id, multi)}
                      onSetSort={(dir) => setColumnSort(header.column.id, dir)}
                      onFilter={() => setFilterSeed((s) => ({ n: s.n + 1, column: header.column.id }))}
                      onHide={() => setVisible(header.column.id, false)}
                      dragging={dragCol === header.column.id}
                      onDragStart={() => setDragCol(header.column.id)}
                      onDragEnd={() => setDragCol(null)}
                      onDropOn={() => dragCol && moveColumn(dragCol, header.column.id)}
                    />
                  ))}
                </tr>
              </thead>
            </table>
          </div>

          <div ref={bodyRef} onScroll={syncScroll} className="no-scrollbar overflow-x-auto">
            <table className={tableClass} style={tableStyle}>
              {colgroup}
              <tbody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {selection && <td className="border-line border-b px-3 py-3" />}
                      {visibleHeaders.map((h) => (
                        <td key={h.id} className="border-line border-b px-3 py-3">
                          <Skeleton className="h-3.5 w-full max-w-36" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  table.getRowModel().rows.map((row) => {
                    const rowId = getRowId(row.original);
                    const selected = selection?.isSelected(rowId);
                    const stickyBg = cn(
                      "bg-surface group-hover/row:bg-hover",
                      selected && "bg-primary-soft group-hover/row:bg-primary-soft",
                      highlightId === rowId && "bg-warning-soft group-hover/row:bg-warning-soft"
                    );
                    return (
                      <tr
                        key={row.id}
                        onClick={
                          onRowClick
                            ? (e) => {
                                const target = e.target as HTMLElement;
                                if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
                                onRowClick(row.original);
                              }
                            : undefined
                        }
                        className={cn(
                          "group/row bg-surface even:bg-page/40 hover:bg-hover",
                          selected && "bg-primary-soft even:bg-primary-soft hover:bg-primary-soft",
                          highlightId === rowId && "bg-warning-soft even:bg-warning-soft",
                          onRowClick && "cursor-pointer"
                        )}
                      >
                        {selection && (
                          <td
                            style={{ left: 0 }}
                            className={cn("border-line sticky z-10 border-b px-3", d.cell, stickyBg)}
                          >
                            <Checkbox
                              aria-label="Select row"
                              checked={!!selected}
                              disabled={!isSelectable(row.original)}
                              onChange={() => selection.toggle(rowId)}
                            />
                          </td>
                        )}
                        {row.getVisibleCells().map((cell) => {
                          const col = byId.get(cell.column.id)!;
                          const pinned = cell.column.id === firstId;
                          return (
                            <td
                              key={cell.id}
                              style={pinned ? { left: selection ? SELECT_W : 0 } : undefined}
                              className={cn(
                                "border-line text-fg-muted truncate border-b px-3",
                                d.cell,
                                col.align === "right" && "text-right tabular-nums",
                                col.align === "center" && "text-center",
                                pinned && cn("sticky z-10 border-r", stickyBg)
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <RecordsView
          view={view}
          rows={rows}
          loading={loading}
          fetching={fetching}
          density={density}
          getRowId={getRowId}
          selection={selection}
          onRowClick={onRowClick}
          highlightId={highlightId}
          isSelectable={isSelectable}
          cardGridClassName={cardGridClassName}
          render={view === "list" ? renderListItem! : renderCard!}
        />
      )}
      {!loading &&
        rows?.length === 0 &&
        (empty ?? <EmptyState title="No rows" description="Try changing the filters." />)}

      <div className="bg-surface sticky -bottom-3 z-20 rounded-b-xl sm:-bottom-4">
        {view === "table" && (
          <div ref={barRef} onScroll={syncScroll} className="overflow-x-auto" aria-hidden>
            <div style={{ width: totalWidth, minWidth: "100%", height: 1 }} />
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

function HeaderCell<T>({
  header,
  column,
  pinned,
  pinLeft,
  sortIndex,
  sortDesc,
  multiSort,
  onSort,
  onSetSort,
  onFilter,
  onHide,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  header: Header<T, unknown>;
  column: GridColumn<T>;
  pinned: boolean;
  pinLeft: number;
  sortIndex: number;
  sortDesc?: boolean;
  multiSort: boolean;
  onSort: (multi: boolean) => void;
  onSetSort: (dir: "asc" | "desc" | null) => void;
  onFilter: () => void;
  onHide: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  const menu = usePopover({ matchWidth: false, maxHeight: 320 });
  const [dropHover, setDropHover] = useState(false);
  const sortable = column.sortable !== false;
  const sorted = sortIndex >= 0;
  const SortIcon = !sorted ? ArrowUpDown : sortDesc ? ArrowDown : ArrowUp;

  return (
    <th
      style={{ width: header.getSize(), ...(pinned ? { left: pinLeft } : {}) }}
      aria-sort={sorted ? (sortDesc ? "descending" : "ascending") : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDropHover(true);
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        onDropOn();
      }}
      className={cn(
        "group/th border-line bg-page text-fg-subtle relative border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase select-none",
        pinned && "sticky z-10 border-r",
        dragging && "opacity-50",
        dropHover && !dragging && "bg-primary-soft",
        column.align === "right" && "text-right"
      )}
    >
      <div className={cn("flex items-center gap-1", column.align === "right" && "flex-row-reverse")}>
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", column.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          className="text-fg-faint -ml-1 hidden cursor-grab group-hover/th:inline active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          disabled={!sortable}
          onClick={(e) => onSort(e.shiftKey)}
          title={sortable ? "Sort (Shift+click to sort by several columns)" : undefined}
          className={cn(
            "flex min-w-0 items-center gap-1 truncate uppercase",
            sortable && "hover:text-fg",
            sorted && "text-fg"
          )}
        >
          <span className="truncate">{column.header}</span>
          {sortable && (
            <SortIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                sorted ? "text-primary" : "opacity-0 group-hover/th:opacity-60"
              )}
            />
          )}
          {sorted && multiSort && <span className="text-primary text-[10px]">{sortIndex + 1}</span>}
        </button>
        <GridPopover
          popover={menu}
          label={`${column.header} column menu`}
          className="w-48 p-1"
          trigger={({ ref, open, toggle }) => (
            <button
              ref={ref}
              type="button"
              aria-label={`${column.header} column menu`}
              onClick={toggle}
              className={cn(
                "text-fg-faint hover:bg-hover hover:text-fg ml-auto rounded p-0.5 transition",
                open ? "opacity-100" : "opacity-0 group-hover/th:opacity-100 focus:opacity-100",
                column.align === "right" && "mr-auto ml-0"
              )}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          )}
        >
          {sortable && (
            <>
              <MenuItem
                icon={ArrowUp}
                active={sorted && !sortDesc}
                onClick={() => (onSetSort("asc"), menu.setOpen(false))}
              >
                Sort ascending
              </MenuItem>
              <MenuItem
                icon={ArrowDown}
                active={sorted && !!sortDesc}
                onClick={() => (onSetSort("desc"), menu.setOpen(false))}
              >
                Sort descending
              </MenuItem>
              {sorted && (
                <MenuItem icon={X} onClick={() => (onSetSort(null), menu.setOpen(false))}>
                  Clear sort
                </MenuItem>
              )}
              <div className="bg-line my-1 h-px" />
            </>
          )}
          {column.type && (
            <MenuItem icon={ListFilter} onClick={() => (menu.setOpen(false), onFilter())}>
              Filter…
            </MenuItem>
          )}
          {!column.alwaysVisible && (
            <MenuItem icon={EyeOff} onClick={() => (menu.setOpen(false), onHide())}>
              Hide column
            </MenuItem>
          )}
        </GridPopover>
      </div>
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        onDoubleClick={() => header.column.resetSize()}
        className={cn(
          "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none transition",
          header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/40"
        )}
      />
    </th>
  );
}

function ColumnsMenu<T>({
  columns,
  visibility,
  onToggle,
  onReset,
}: {
  columns: GridColumn<T>[];
  visibility: Record<string, boolean>;
  onToggle: (id: string, visible: boolean) => void;
  onReset: () => void;
}) {
  const popover = usePopover({ matchWidth: false, maxHeight: 420 });
  return (
    <GridPopover
      popover={popover}
      label="Columns"
      className="w-56 p-1"
      trigger={({ ref, open, toggle }) => (
        <ToolbarIconButton refCb={ref} active={open} onClick={toggle} label="Columns" icon={Columns3} />
      )}
    >
      <p className="text-fg-faint px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">
        Show columns
      </p>
      {columns.map((c) => (
        <label
          key={c.id}
          className={cn(
            "text-fg-muted hover:bg-hover flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
            c.alwaysVisible && "opacity-60"
          )}
        >
          <Checkbox
            checked={!!visibility[c.id]}
            disabled={c.alwaysVisible}
            onChange={(on) => onToggle(c.id, on)}
            aria-label={c.header}
          />
          {c.header}
        </label>
      ))}
      <div className="bg-line my-1 h-px" />
      <MenuItem icon={RotateCcw} onClick={onReset}>
        Reset layout
      </MenuItem>
    </GridPopover>
  );
}

function DensityMenu({ value, onChange }: { value: Density; onChange: (v: Density) => void }) {
  const popover = usePopover({ matchWidth: false, maxHeight: 200 });
  return (
    <GridPopover
      popover={popover}
      label="Row density"
      className="w-44 p-1"
      trigger={({ ref, open, toggle }) => (
        <ToolbarIconButton refCb={ref} active={open} onClick={toggle} label="Density" icon={Rows3} />
      )}
    >
      {(Object.keys(DENSITY) as Density[]).map((k) => (
        <MenuItem
          key={k}
          active={value === k}
          onClick={() => {
            onChange(k);
            popover.setOpen(false);
          }}
        >
          {DENSITY[k].label}
        </MenuItem>
      ))}
    </GridPopover>
  );
}

export type { SortRule };

function RecordsView<T>({
  view,
  rows,
  loading,
  fetching,
  density,
  getRowId,
  selection,
  onRowClick,
  highlightId,
  render,
  isSelectable,
  cardGridClassName,
}: {
  view: "list" | "cards";
  rows: T[] | undefined;
  loading?: boolean;
  fetching?: boolean;
  density: Density;
  getRowId: (row: T) => number;
  selection?: BulkSelection;
  onRowClick?: (row: T) => void;
  highlightId?: number | null;
  render: (row: T, slots: RowSlots) => ReactNode;
  isSelectable: (row: T) => boolean;
  cardGridClassName?: string;
}) {
  const cards = view === "cards";
  const cardGrid = cn(
    "grid gap-3 p-3 sm:p-4",
    cardGridClassName ?? "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
  );
  const pad = density === "compact" ? "py-2" : density === "comfortable" ? "py-4" : "py-3";

  const click = (row: T) => (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!onRowClick || !e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
    onRowClick(row);
  };

  return (
    <div className="relative">
      {fetching && !loading && (
        <div className="grid-progress bg-primary/20 absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" />
      )}
      {loading ? (
        <ul className={cards ? cardGrid : "divide-line divide-y"}>
          {Array.from({ length: cards ? 6 : 8 }).map((_, i) => (
            <li key={i} className={cards ? "border-line rounded-xl border p-4" : "px-4 py-3"}>
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-4/5" />
              {cards && <Skeleton className="mt-4 h-3 w-1/3" />}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={cards ? cardGrid : "divide-line divide-y"}>
          {(rows ?? []).map((row) => {
            const id = getRowId(row);
            const selected = !!selection?.isSelected(id);
            const checkbox = selection ? (
              <Checkbox
                disabled={!isSelectable(row)}
                aria-label="Select"
                checked={selected}
                onChange={() => selection.toggle(id)}
              />
            ) : null;
            return (
              <li
                key={id}
                onClick={click(row)}
                className={cn(
                  "transition",
                  onRowClick && "cursor-pointer",
                  cards
                    ? "border-line bg-surface hover:border-line-strong flex flex-col rounded-xl border p-4 shadow-xs hover:shadow-md"
                    : cn("hover:bg-hover px-3 sm:px-4", pad),
                  selected &&
                    (cards
                      ? "border-primary ring-primary/15 ring-3"
                      : "bg-primary-soft hover:bg-primary-soft"),
                  highlightId === id && (cards ? "border-warning ring-warning/20 ring-3" : "bg-warning-soft")
                )}
              >
                {render(row, { checkbox, selected })}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const VIEW_META: Record<GridView, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  table: { label: "Table view", icon: Table2 },
  list: { label: "List view", icon: List },
  cards: { label: "Card view", icon: LayoutGrid },
};

function ViewSwitch({
  views,
  value,
  onChange,
}: {
  views: GridView[];
  value: GridView;
  onChange: (v: GridView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="border-line bg-surface flex h-9 items-center rounded-lg border p-0.5"
    >
      {views.map((v) => {
        const { label, icon: Icon } = VIEW_META[v];
        const active = v === value;
        return (
          <Tooltip key={v} label={label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => onChange(v)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                active
                  ? "bg-primary text-primary-fg shadow-xs"
                  : "text-fg-subtle hover:bg-hover hover:text-fg"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SortMenu<T>({
  columns,
  sort,
  onSort,
}: {
  columns: GridColumn<T>[];
  sort: SortRule[];
  onSort: (id: string, dir: "asc" | "desc" | null) => void;
}) {
  const popover = usePopover({ matchWidth: false, maxHeight: 360 });
  const current = sort[0];
  const sortable = columns.filter((c) => c.sortable !== false);
  return (
    <GridPopover
      popover={popover}
      label="Sort"
      className="w-56 p-1"
      trigger={({ ref, open, toggle }) => (
        <ToolbarIconButton
          refCb={ref}
          active={open}
          onClick={toggle}
          label="Sort"
          icon={ArrowUpDown}
          badge={sort.length}
        />
      )}
    >
      <p className="text-fg-faint px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">
        Sort by
      </p>
      {sortable.map((c) => {
        const active = current?.id === c.id;
        return (
          <MenuItem
            key={c.id}
            active={active}
            icon={active ? (current!.desc ? ArrowDown : ArrowUp) : undefined}
            onClick={() => onSort(c.id, active ? (current!.desc ? "asc" : "desc") : "asc")}
          >
            {c.header}
            {active && (
              <span className="text-fg-subtle ml-1 text-xs">
                ({current!.desc ? "high → low" : "low → high"})
              </span>
            )}
          </MenuItem>
        );
      })}
      {current && (
        <>
          <div className="bg-line my-1 h-px" />
          <MenuItem icon={X} onClick={() => (onSort(current.id, null), popover.setOpen(false))}>
            Clear sort
          </MenuItem>
        </>
      )}
    </GridPopover>
  );
}
