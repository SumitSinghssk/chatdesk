"use client";

import { useEffect, useRef, useState } from "react";

type GoogleId = {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme?: string;
      size?: string;
      text?: string;
      shape?: string;
      width?: number;
      logo_alignment?: string;
    }
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let loader: Promise<void> | null = null;

function loadScript() {
  loader ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

export function GoogleButton({
  clientId,
  text = "continue_with",
  onCredential,
}: {
  clientId: string;
  text?: "signin_with" | "signup_with" | "continue_with";
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callback.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        const el = ref.current;
        const google = window.google?.accounts.id;
        if (cancelled || !el || !google) return;
        google.initialize({
          client_id: clientId,
          ux_mode: "popup",
          cancel_on_tap_outside: true,
          callback: (res) => res.credential && callback.current(res.credential),
        });
        el.innerHTML = "";
        google.renderButton(el, {
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(400, Math.max(200, el.offsetWidth)),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (failed) {
    return (
      <p className="text-fg-subtle text-center text-sm">
        Google sign-in couldn&apos;t load. Try another way.
      </p>
    );
  }
  return <div ref={ref} className="flex min-h-11 w-full justify-center" />;
}
