"use client";

import { useEffect, useState } from "react";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";

const SENTINEL = "__skDirtyGuard";

class DirtyGuard {
  private dirty = false;
  private pushed = false;
  private ignorePop: (() => void) | null = null;

  constructor(private readonly guardBack: boolean) {}

  get current() {
    return this.dirty;
  }

  set current(value: boolean) {
    this.dirty = value;
    if (value) this.arm();
    else void this.release();
  }

  arm() {
    if (!this.guardBack || !this.dirty || this.pushed || typeof window === "undefined") return;
    if (this.ignorePop) return;
    window.history.pushState({ [SENTINEL]: true }, "");
    this.pushed = true;
  }

  release(): Promise<void> {
    this.dirty = false;
    if (!this.pushed) return Promise.resolve();
    this.pushed = false;
    return new Promise((resolve) => {
      const done = () => {
        if (this.ignorePop !== done) return;
        this.ignorePop = null;
        resolve();
        this.arm();
      };
      this.ignorePop = done;
      window.history.back();
      setTimeout(done, 1000);
    });
  }

  consumePop(): boolean {
    if (this.ignorePop) {
      this.ignorePop();
      return false;
    }
    if (!this.pushed) return false;
    this.pushed = false;
    return true;
  }
}

export function useDirtyClose(onClose: () => void, { guardBack = false }: { guardBack?: boolean } = {}) {
  const confirm = useConfirm();
  const [dirtyRef] = useState(() => new DirtyGuard(guardBack));

  const askDiscard = () =>
    confirm({
      title: "Discard unsaved changes?",
      message: "Your edits haven't been saved and will be lost.",
      confirmLabel: "Discard",
      variant: "warning",
    });

  useEffect(() => {
    if (!guardBack) return;
    const onPopState = () => {
      if (!dirtyRef.consumePop()) return;
      const href = window.location.href;
      void askDiscard().then((ok) => {
        if (window.location.href !== href) return;
        if (ok) {
          dirtyRef.current = false;
          window.history.back();
        } else {
          dirtyRef.arm();
        }
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  const discard = () => dirtyRef.release();

  const requestClose = async () => {
    if (dirtyRef.current && !(await askDiscard())) return;
    await discard();
    onClose();
  };

  return { dirtyRef, requestClose, discard };
}

export function useReportDirty(dirtyRef: { current: boolean }, dirty: boolean) {
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirtyRef, dirty]);
}
