from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.menus.models import Menu, MenuItem
from app.modules.admin.menus.schemas import MAX_DEPTH, MAX_ITEMS, MenuItemInput, MenuUpdateSchema
from app.shared.utils.datetime import iso, now

SUBJECT = "menu"


def build_tree(items: list[MenuItem], active_only: bool = False) -> list[dict]:
    by_parent: dict[int | None, list[MenuItem]] = {}
    ids = {i.id for i in items}
    for item in sorted(items, key=lambda i: (i.sort_order, i.id)):
        parent = item.parent_id if item.parent_id in ids else None
        by_parent.setdefault(parent, []).append(item)

    def walk(parent_id: int | None, depth: int) -> list[dict]:
        nodes = []
        for item in by_parent.get(parent_id, []):
            if active_only and not item.is_active:
                continue
            nodes.append({
                "id": item.id,
                "label": item.label,
                "url": item.url,
                "new_tab": item.new_tab,
                "is_active": item.is_active,
                "children": walk(item.id, depth + 1) if depth < MAX_DEPTH else [],
            })
        return nodes

    return walk(None, 1)


def get_menu_by_key(db: Session, key: str) -> Menu:
    menu = db.query(Menu).filter(Menu.key == key).first()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    return menu


def _menu_items(db: Session, menu_id: int) -> list[MenuItem]:
    return db.query(MenuItem).filter(MenuItem.menu_id == menu_id).all()


def _serialize(menu: Menu, items: list[MenuItem]) -> dict:
    return {
        "id": menu.id,
        "key": menu.key,
        "name": menu.name,
        "items_count": len(items),
        "items": build_tree(items),
        "updated_at": iso(menu.updated_at),
    }


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _validate_tree(nodes: list[MenuItemInput]) -> None:
    total = 0

    def walk(children: list[MenuItemInput], depth: int) -> None:
        nonlocal total
        for node in children:
            total += 1
            if depth > MAX_DEPTH:
                raise _field_error("items", f"Menus can be nested at most {MAX_DEPTH} levels deep")
            walk(node.children, depth + 1)

    walk(nodes, 1)
    if total > MAX_ITEMS:
        raise _field_error("items", f"A menu can have at most {MAX_ITEMS} items")


def list_menus(db: Session):
    counts = dict(
        db.query(MenuItem.menu_id, func.count(MenuItem.id)).group_by(MenuItem.menu_id).all()
    )
    menus = db.query(Menu).order_by(Menu.id.asc()).all()
    return {"status": True, "data": [
        {"id": m.id, "key": m.key, "name": m.name, "items_count": counts.get(m.id, 0),
         "updated_at": iso(m.updated_at)}
        for m in menus
    ]}


def get_menu(db: Session, key: str):
    menu = get_menu_by_key(db, key)
    return {"status": True, "data": _serialize(menu, _menu_items(db, menu.id))}


def _outline(nodes: list, prefix: str = "") -> dict[str, str]:
    lines: dict[str, str] = {}
    for node in nodes:
        get = node.get if isinstance(node, dict) else lambda k, n=node: getattr(n, k)
        path = f"{prefix}{get('label')}"
        flags = [f for f, on in (("new tab", get("new_tab")), ("hidden", not get("is_active"))) if on]
        lines[path] = get("url") + (f" ({', '.join(flags)})" if flags else "")
        lines.update(_outline(get("children") or [], f"{path} › "))
    return lines


def _menu_changes(before: list, after: list) -> tuple[dict, dict, str]:
    old_lines, new_lines = _outline(before), _outline(after)
    added = [p for p in new_lines if p not in old_lines]
    removed = [p for p in old_lines if p not in new_lines]
    changed = [p for p in new_lines if p in old_lines and new_lines[p] != old_lines[p]]
    moved = list(old_lines) != list(new_lines) and not added and not removed
    old = {**{p: old_lines[p] for p in removed}, **{p: old_lines[p] for p in changed}}
    new = {**{p: new_lines[p] for p in added}, **{p: new_lines[p] for p in changed}}
    parts = [f"{len(added)} added" if added else "", f"{len(removed)} removed" if removed else "",
             f"{len(changed)} changed" if changed else "", "reordered" if moved else ""]
    if moved:
        old["order"] = list(old_lines)
        new["order"] = list(new_lines)
    return old, new, ", ".join(p for p in parts if p) or "no changes"


def save_menu(db: Session, key: str, payload: MenuUpdateSchema, request: Request):
    menu = get_menu_by_key(db, key)
    _validate_tree(payload.items)

    before = build_tree(_menu_items(db, menu.id))
    old_count = db.query(MenuItem).filter(MenuItem.menu_id == menu.id).delete(synchronize_session=False)
    db.flush()

    count = 0

    def insert(nodes: list[MenuItemInput], parent_id: int | None) -> None:
        nonlocal count
        for index, node in enumerate(nodes):
            item = MenuItem(menu_id=menu.id, parent_id=parent_id, label=node.label, url=node.url,
                            new_tab=node.new_tab, is_active=node.is_active, sort_order=index)
            db.add(item)
            db.flush()
            count += 1
            insert(node.children, item.id)

    insert(payload.items, None)
    menu.updated_at = now()
    old, new, summary = _menu_changes(before, payload.items)
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=menu.id,
                 subject_label=menu.name, description=f"Saved menu: {summary} ({old_count} → {count} links)",
                 old_values=old, new_values=new)
    db.commit()
    db.expire_all()
    return {"status": True, "message": "Menu saved", "data": _serialize(menu, _menu_items(db, menu.id))}
