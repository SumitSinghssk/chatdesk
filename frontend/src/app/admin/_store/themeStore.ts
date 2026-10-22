"use client";

import { ADMIN_ROUTES } from "@/config/routes";
import { create } from "zustand";

export type ThemeMode = "light" | "dark";

const KEY = "sk_theme";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode:
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  setMode: (mode) => {
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
    set({ mode });
  },
  toggle: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
}));

export const themeInitScript = `(function(){try{if(location.pathname.indexOf("${ADMIN_ROUTES.ROOT.path}")!==0)return;var m=localStorage.getItem("${KEY}");if(!m){m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(m==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;
