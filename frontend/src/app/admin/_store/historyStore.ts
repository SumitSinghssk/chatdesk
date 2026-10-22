"use client";

import { create } from "zustand";

export interface HistorySubject {
  type: string;
  id: number;
  label?: string;
}

interface HistoryState {
  subject: HistorySubject | null;
  open: (subject: HistorySubject) => void;
  close: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  subject: null,
  open: (subject) => set({ subject }),
  close: () => set({ subject: null }),
}));
