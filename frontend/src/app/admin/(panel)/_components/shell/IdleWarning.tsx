"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminPortalTarget } from "@/app/admin/_components/ui/portal";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";

import { Button } from "@/app/admin/_components/ui/index";
import { fetchMe, logout } from "@/app/admin/_lib/api/authApi";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { ADMIN_ROUTES } from "@/config/routes";
const STORAGE_KEY = "sk_last_activity";
const WARN_SECONDS = 60;
const WRITE_EVERY_MS = 5_000;
const EVENTS = ["mousemove", "mousedown", "keydown", "click", "scroll", "touchstart", "wheel"] as const;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(at));
  } catch {}
}

export function IdleWarning() {
  const minutes = useAuthStore((s) => s.user?.idle_minutes ?? 0);
  if (!minutes || minutes <= 0) return null;
  return <IdleWatcher minutes={minutes} />;
}

function IdleWatcher({ minutes }: { minutes: number }) {
  const router = useRouter();
  const last = useRef(0);
  const lastWrite = useRef(0);
  const warningRef = useRef(false);
  const signingOut = useRef(false);
  const pendingClear = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [staying, setStaying] = useState(false);
  const limitMs = minutes * 60_000;

  const markActive = useCallback((force = false) => {
    const at = Date.now();
    last.current = at;
    if (force || at - lastWrite.current > WRITE_EVERY_MS) {
      lastWrite.current = at;
      writeShared(at);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await logout();
    } catch {}
    pendingClear.current = true;
    router.replace(ADMIN_ROUTES.LOGIN({ idle: "1" }));
    window.setTimeout(() => useAuthStore.getState().clear(), 4_000);
  }, [router]);

  useEffect(
    () => () => {
      if (pendingClear.current) useAuthStore.getState().clear();
    },
    []
  );

  useEffect(() => {
    markActive(true);
    const onActivity = () => {
      if (!warningRef.current) markActive();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) last.current = Math.max(last.current, Number(e.newValue) || 0);
    };
    EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    window.addEventListener("storage", onStorage);
    return () => {
      EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
      window.removeEventListener("storage", onStorage);
    };
  }, [markActive]);

  useEffect(() => {
    const tick = () => {
      if (signingOut.current) return;
      last.current = Math.max(last.current, readShared());
      const left = Math.ceil((limitMs - (Date.now() - last.current)) / 1000);
      if (left <= 0) {
        setSecondsLeft(0);
        void signOut();
      } else if (left <= WARN_SECONDS) {
        warningRef.current = true;
        setSecondsLeft(left);
      } else if (warningRef.current) {
        warningRef.current = false;
        setSecondsLeft(null);
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      if (!warningRef.current && !signingOut.current) markActive();
    };
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [limitMs, markActive, signOut]);

  const stay = async () => {
    setStaying(true);
    try {
      await fetchMe();
      markActive(true);
      warningRef.current = false;
      setSecondsLeft(null);
    } catch {
    } finally {
      setStaying(false);
    }
  };

  if (secondsLeft === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      aria-describedby="idle-text"
      className="admin-theme fixed inset-0 z-130 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
    >
      <div className="modal-panel border-line bg-surface w-full max-w-sm rounded-2xl border p-6 text-center shadow-xl">
        <span className="bg-warning-soft text-warning mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <Clock className="h-5 w-5" />
        </span>
        <h2 id="idle-title" className="text-fg mt-4 text-base font-semibold">
          Still there?
        </h2>
        <p id="idle-text" className="text-fg-subtle mt-1.5 text-sm">
          You&apos;ll be signed out in{" "}
          <span className="tabular text-fg font-semibold">
            {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
          </span>{" "}
          because there&apos;s been no activity for a while.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button fullWidth onClick={stay} loading={staying} autoFocus>
            Stay signed in
          </Button>
          <Button fullWidth variant="ghost" leftIcon={LogOut} onClick={() => void signOut()}>
            Sign out now
          </Button>
        </div>
      </div>
    </div>,
    adminPortalTarget()
  );
}
