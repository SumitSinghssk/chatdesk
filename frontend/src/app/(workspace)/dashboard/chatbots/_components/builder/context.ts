"use client";

import { createContext, useContext } from "react";

import type { BotReport, BotTrigger } from "../../../_lib/chatbotsApi";
import type { MatchType } from "../../../_lib/automationApi";

export interface BuilderState {
  /** Problems per block from the last save: errors stop publishing, warnings don't. */
  problems: Record<string, { errors: string[]; warnings: string[] }>;
  report: BotReport | null;
  /** The block the test chat is at, and connections it went through. */
  testNode: string | null;
  testEdges: Set<string>;
  chatbots: { id: number; name: string }[];
  members: Record<number, string>;
  teams: Record<number, string>;
  trigger: { trigger: BotTrigger; keywords: string[]; match: MatchType };
  editable: boolean;
  edit: (id: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  removeEdge: (id: string) => void;
  openSettings: () => void;
}

export const BuilderContext = createContext<BuilderState | null>(null);

export function useBuilder(): BuilderState {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder outside the chatbot builder");
  return ctx;
}
