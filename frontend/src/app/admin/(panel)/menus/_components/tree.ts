import type { MenuItemNode } from "@/app/admin/_lib/api/menusApi";

export const MAX_DEPTH = 3;

export interface TreeNode {
  uid: string;
  label: string;
  url: string;
  new_tab: boolean;
  is_active: boolean;
  children: TreeNode[];
}

export type NodePath = number[];

let seq = 0;
const uid = () => `n${++seq}`;

export const newNode = (): TreeNode => ({
  uid: uid(),
  label: "",
  url: "",
  new_tab: false,
  is_active: true,
  children: [],
});

export const fromApi = (items: MenuItemNode[]): TreeNode[] =>
  items.map((i) => ({
    uid: uid(),
    label: i.label,
    url: i.url,
    new_tab: i.new_tab,
    is_active: i.is_active,
    children: fromApi(i.children ?? []),
  }));

export const toApi = (nodes: TreeNode[]): Omit<MenuItemNode, "id">[] =>
  nodes.map(({ label, url, new_tab, is_active, children }) => ({
    label: label.trim(),
    url: url.trim(),
    new_tab,
    is_active,
    children: toApi(children),
  }));

export const height = (node: TreeNode): number => 1 + Math.max(0, ...node.children.map(height));

export const count = (nodes: TreeNode[]): number =>
  nodes.reduce((n, node) => n + 1 + count(node.children), 0);

export const findInvalid = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => [...(!n.label.trim() || !n.url.trim() ? [n.uid] : []), ...findInvalid(n.children)]);

function siblings(tree: TreeNode[], path: NodePath): TreeNode[] {
  let list = tree;
  for (const i of path.slice(0, -1)) list = list[i]!.children;
  return list;
}

function edit(tree: TreeNode[], fn: (draft: TreeNode[]) => void): TreeNode[] {
  const draft = structuredClone(tree);
  fn(draft);
  return draft;
}

export const ops = {
  update: (tree: TreeNode[], path: NodePath, patch: Partial<TreeNode>) =>
    edit(tree, (d) => Object.assign(siblings(d, path)[path.at(-1)!]!, patch)),

  remove: (tree: TreeNode[], path: NodePath) => edit(tree, (d) => siblings(d, path).splice(path.at(-1)!, 1)),

  addChild: (tree: TreeNode[], path: NodePath, node: TreeNode) =>
    edit(tree, (d) => siblings(d, path)[path.at(-1)!]!.children.push(node)),
};

export type DropPosition = "before" | "after" | "inside";

function locate(
  list: TreeNode[],
  uid: string,
  level = 1
): { list: TreeNode[]; index: number; level: number } | null {
  for (let index = 0; index < list.length; index++) {
    if (list[index]!.uid === uid) return { list, index, level };
    const found = locate(list[index]!.children, uid, level + 1);
    if (found) return found;
  }
  return null;
}

const contains = (node: TreeNode, uid: string): boolean =>
  node.children.some((c) => c.uid === uid || contains(c, uid));

export function canDrop(
  tree: TreeNode[],
  dragUid: string,
  targetUid: string,
  position: DropPosition
): boolean {
  if (dragUid === targetUid) return false;
  const from = locate(tree, dragUid);
  const to = locate(tree, targetUid);
  if (!from || !to) return false;
  const node = from.list[from.index]!;
  if (contains(node, targetUid)) return false;
  const level = position === "inside" ? to.level + 1 : to.level;
  return level + height(node) - 1 <= MAX_DEPTH;
}

export const moveTo = (tree: TreeNode[], dragUid: string, targetUid: string, position: DropPosition) =>
  edit(tree, (d) => {
    const from = locate(d, dragUid);
    if (!from) return;
    const [node] = from.list.splice(from.index, 1);
    const to = locate(d, targetUid);
    if (!to) return;
    if (position === "inside") to.list[to.index]!.children.push(node!);
    else to.list.splice(to.index + (position === "after" ? 1 : 0), 0, node!);
  });
