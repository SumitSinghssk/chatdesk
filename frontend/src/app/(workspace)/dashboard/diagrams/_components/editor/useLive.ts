"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CatchUp, DiagramContent, LiveState, Op, Person } from "../../../_lib/diagramsApi";

export type LiveStatus = "connecting" | "live" | "polling" | "closed";

export interface Batch {
  seq: number;
  client: string | null;
  actor: string | null;
  ops: Op[];
}

export interface PeerState {
  id: string;
  person: Person;
  cursor: { x: number; y: number } | null;
  selection: string[];
  drag: Record<string, { x: number; y: number }> | null;
  /** the middle of what they're looking at, and their zoom (follow mode) */
  view: { x: number; y: number; zoom: number } | null;
  seen: number;
}

export interface LiveHandlers {
  onBatch: (batch: Batch) => void;
  onReload: (content: DiagramContent, seq: number) => void;
  onAck: (ref: number, seq: number) => void;
  onRejected: (ref: number, message: string) => void;
  onComments?: () => void;
  onMeta?: (meta: { name?: string; folder?: string | null }) => void;
  onLevel?: (level: string) => void;
  onClosed?: (message: string) => void;
  onState?: (state: LiveState) => void;
}

interface Options {
  /** the socket address; `since` left out asks for the whole diagram again */
  url: (since: number | null) => string;
  changes: (since: number) => Promise<CatchUp>;
  save?: (ops: Op[], clientId: string) => Promise<{ seq: number }>;
  seq: number;
  handlers: LiveHandlers;
}

const PEER_TIMEOUT = 45_000;
const HEARTBEAT = 15_000;
const POLL = 2_500;

/**
 * The live connection to a diagram: changes in and out, and who else is here. Falls back to asking
 * every few seconds (and saving over HTTP) when a WebSocket can't be opened, and keeps trying to go live.
 */
export function useLive({ url, changes, save, seq: initialSeq, handlers }: Options) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
  const clientId = useRef(`c${Math.random().toString(36).slice(2, 10)}`).current;
  const socket = useRef<WebSocket | null>(null);
  const seq = useRef(initialSeq);
  const nextRef = useRef(1);
  const unacked = useRef(0); // changes sent and not confirmed (a reconnect then asks for the whole diagram)
  const presence = useRef<{
    cursor: PeerState["cursor"];
    selection: string[];
    drag: PeerState["drag"];
    view: PeerState["view"];
  }>({ cursor: null, selection: [], drag: null, view: null });
  const lastPresence = useRef(0);
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ url, changes, save, handlers });
  useEffect(() => {
    live.current = { url, changes, save, handlers };
  });
  const closed = useRef(false);

  const handleBatch = useCallback((batch: Batch) => {
    if (batch.seq <= seq.current) return;
    seq.current = batch.seq;
    live.current.handlers.onBatch(batch);
  }, []);

  const applyCatchUp = useCallback(
    (state: CatchUp) => {
      if (state.gone) {
        closed.current = true;
        setStatus("closed");
        live.current.handlers.onClosed?.("This diagram was deleted.");
        return;
      }
      if (state.reload && state.content) {
        seq.current = state.seq;
        live.current.handlers.onReload(state.content, state.seq);
      } else for (const b of state.batches ?? []) handleBatch(b);
    },
    [handleBatch]
  );

  const updatePeer = useCallback((id: string, change: Partial<PeerState> & { person?: Person }) => {
    setPeers((prev) => {
      const next = new Map(prev);
      const before = next.get(id);
      if (!before && !change.person) return prev;
      next.set(id, {
        id,
        person: change.person ?? before!.person,
        cursor: change.cursor !== undefined ? change.cursor : (before?.cursor ?? null),
        selection: change.selection !== undefined ? change.selection : (before?.selection ?? []),
        drag: change.drag !== undefined ? change.drag : (before?.drag ?? null),
        view: change.view !== undefined ? change.view : (before?.view ?? null),
        seen: Date.now(),
      });
      return next;
    });
  }, []);

  // connection -----------------------------------------------------------------------------------------
  useEffect(() => {
    closed.current = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let poller: ReturnType<typeof setInterval> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const poll = async () => {
      try {
        applyCatchUp(await live.current.changes(seq.current));
      } catch {
        /* offline for a moment: the next poll tries again */
      }
    };
    const startPolling = () => {
      if (poller || stopped || closed.current) return;
      setStatus("polling");
      poller = setInterval(poll, POLL);
    };
    const stopPolling = () => {
      if (poller) clearInterval(poller);
      poller = null;
    };

    const connect = () => {
      if (stopped || closed.current) return;
      if (!poller) setStatus("connecting");
      let opened = false;
      const ws = new WebSocket(live.current.url(unacked.current ? null : seq.current));
      socket.current = ws;
      const giveUp = setTimeout(() => !opened && ws.close(), 6000);
      ws.onopen = () => {
        opened = true;
        clearTimeout(giveUp);
      };
      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }
        const h = live.current.handlers;
        switch (msg.type) {
          case "hello":
            attempts = 0;
            stopPolling();
            setStatus("live");
            unacked.current = 0;
            applyCatchUp(msg as unknown as CatchUp);
            if (msg.state) h.onState?.(msg.state as LiveState);
            setPeers(new Map());
            sendPresence(true);
            break;
          case "ops":
            handleBatch(msg as unknown as Batch);
            break;
          case "reload":
            applyCatchUp({ ...(msg as unknown as CatchUp), reload: true });
            break;
          case "ack":
            // (the position only moves with the changes themselves, which come in order)
            unacked.current = Math.max(0, unacked.current - 1);
            h.onAck(msg.ref as number, msg.seq as number);
            break;
          case "error":
            unacked.current = Math.max(0, unacked.current - 1);
            h.onRejected(msg.ref as number, (msg.message as string) ?? "Couldn't save that change");
            break;
          case "join":
          case "presence":
            updatePeer(msg.from as string, {
              person: msg.peer as Person,
              ...(msg.type === "presence"
                ? {
                    cursor: (msg.cursor as PeerState["cursor"]) ?? null,
                    selection: (msg.selection as string[]) ?? [],
                    drag: (msg.drag as PeerState["drag"]) ?? null,
                    view: (msg.view as PeerState["view"]) ?? null,
                  }
                : {}),
            });
            break;
          case "leave":
            setPeers((prev) => {
              const next = new Map(prev);
              next.delete(msg.from as string);
              return next;
            });
            break;
          case "state":
            h.onState?.(msg as unknown as LiveState);
            break;
          case "comments":
            h.onComments?.();
            break;
          case "meta":
            h.onMeta?.(msg as { name?: string; folder?: string | null });
            break;
          case "level":
            h.onLevel?.(msg.level as string);
            break;
          case "closed":
            closed.current = true;
            setStatus("closed");
            h.onClosed?.((msg.message as string) ?? "This diagram is no longer available.");
            break;
        }
      };
      ws.onclose = (event) => {
        clearTimeout(giveUp);
        if (socket.current === ws) socket.current = null;
        if (stopped || closed.current) return;
        if (event.code === 4403 || event.code === 4404 || event.code === 4401) {
          closed.current = true;
          setStatus("closed");
          live.current.handlers.onClosed?.(
            event.code === 4401 ? "You were signed out." : "This diagram is no longer available to you."
          );
          return;
        }
        attempts += 1;
        if (attempts >= 3) startPolling(); // the network or the server can't keep a live line: ask instead
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)));
      };
    };

    connect();
    heartbeat = setInterval(() => {
      sendPresence(true);
      const now = Date.now();
      setPeers((prev) => {
        const stale = [...prev.values()].filter((p) => now - p.seen > PEER_TIMEOUT);
        if (!stale.length) return prev;
        const next = new Map(prev);
        stale.forEach((p) => next.delete(p.id));
        return next;
      });
    }, HEARTBEAT);
    const onFocus = () => {
      if (socket.current?.readyState !== WebSocket.OPEN && !closed.current) {
        if (retry) clearTimeout(retry);
        connect();
      }
    };
    window.addEventListener("online", onFocus);
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      if (presenceTimer.current) clearTimeout(presenceTimer.current);
      stopPolling();
      window.removeEventListener("online", onFocus);
      socket.current?.close();
      socket.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one connection for the life of the editor
  }, []);

  function sendPresence(force = false) {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const wait = 50 - (Date.now() - lastPresence.current);
    if (!force && wait > 0) {
      if (!presenceTimer.current)
        presenceTimer.current = setTimeout(() => {
          presenceTimer.current = null;
          sendPresence(true);
        }, wait);
      return;
    }
    lastPresence.current = Date.now();
    ws.send(JSON.stringify({ type: "presence", ...presence.current }));
  }

  /** Sends changes. Returns a number the confirmation (onAck / onRejected) will carry. */
  const send = useCallback(
    (ops: Op[]) => {
      const ref = nextRef.current++;
      const ws = socket.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        unacked.current += 1;
        ws.send(JSON.stringify({ type: "ops", ref, client_id: clientId, ops }));
        return ref;
      }
      const saver = live.current.save;
      if (!saver) {
        queueMicrotask(() => live.current.handlers.onRejected(ref, "You can't edit this diagram"));
        return ref;
      }
      saver(ops, clientId)
        .then((res) => live.current.handlers.onAck(ref, res.seq))
        .catch((err: Error) => live.current.handlers.onRejected(ref, err.message));
      return ref;
    },
    [clientId]
  );

  const setPresence = useCallback((change: Partial<typeof presence.current>) => {
    presence.current = { ...presence.current, ...change };
    sendPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendPresence only reads refs
  }, []);

  return { status, peers, clientId, send, setPresence };
}
