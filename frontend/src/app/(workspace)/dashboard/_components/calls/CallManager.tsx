"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { WA_CALLS_QK, waCallsApi, type WaCall } from "../../_lib/waCallsApi";
import { useDashboard } from "../DashboardContext";
import { answerOffer, createOffer, startRingtone, type Leg } from "./webrtc";

const LIVE = new Set(["dialing", "ringing", "answering", "answered"]);
const LABELS: Record<string, string> = {
  dialing: "Calling…",
  ringing: "Ringing…",
  answering: "Connecting…",
  answered: "On the call",
  ended: "Call ended",
  missed: "Missed",
  declined: "Declined",
  rejected: "Declined",
  no_answer: "No answer",
  failed: "Call failed",
};

interface Session {
  callId: number;
  direction: "in" | "out";
  name: string;
  conversationId: number;
  status: string;
  answeredAt: number | null;
}

interface CallsContext {
  /** WhatsApp calling is on for this number */
  enabled: boolean;
  /** this person is on a call (or placing one) */
  busy: boolean;
  /** calls the customer of a chat; resolves when the call is placed (or failed) */
  start: (conversationId: number, name: string) => Promise<void>;
}

const Ctx = createContext<CallsContext>({ enabled: false, busy: false, start: async () => undefined });

export function useWaCalls() {
  return useContext(Ctx);
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Rings, answers and places WhatsApp calls in the browser, for the whole dashboard. */
export function CallManager({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { me } = useDashboard();
  const canAnswer = me.role !== "viewer";
  const audioRef = useRef<HTMLAudioElement>(null);
  const legRef = useRef<Leg | null>(null);
  const remoteSet = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [muted, setMuted] = useState(false);
  const [busyAnswer, setBusyAnswer] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const poll = useQuery({
    queryKey: WA_CALLS_QK.RINGING,
    queryFn: async () => (await waCallsApi.ringing()).data,
    refetchInterval: (q) => (q.state.data?.enabled === false ? 60_000 : 3000),
    refetchIntervalInBackground: false,
    enabled: canAnswer,
  });
  const enabled = !!poll.data?.enabled;
  const incoming = !session ? poll.data?.ringing.find((c) => c.status === "ringing") : undefined;

  const cleanup = useCallback(() => {
    legRef.current?.close();
    legRef.current = null;
    remoteSet.current = false;
    setMuted(false);
    setSession(null);
    void qc.invalidateQueries({ queryKey: WA_CALLS_QK.RINGING });
  }, [qc]);

  // ring while a call waits for someone
  useEffect(() => {
    if (!incoming) return;
    return startRingtone();
  }, [incoming?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow my live call: the customer's answer (outgoing), and the end (either side)
  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const call = (await waCallsApi.get(session.callId)).data;
        if (stop) return;
        if (call.direction === "out" && call.answer_sdp && !remoteSet.current && legRef.current) {
          remoteSet.current = true;
          await legRef.current.pc.setRemoteDescription({ type: "answer", sdp: call.answer_sdp });
        }
        if (!LIVE.has(call.status)) {
          toast(`${session.name}: ${LABELS[call.status] ?? "Call ended"}`);
          cleanup();
          return;
        }
        setSession((s) =>
          s && s.callId === call.id
            ? {
                ...s,
                status: call.status,
                answeredAt: call.answered_at ? new Date(call.answered_at).getTime() : s.answeredAt,
              }
            : s
        );
      } catch {
        /* a missed poll is fine */
      }
    };
    void tick();
    const timer = setInterval(
      () => void tick(),
      session.direction === "out" && !remoteSet.current ? 1000 : 2000
    );
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [session?.callId, session?.direction, cleanup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.answeredAt) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.answeredAt]);

  const answer = async (call: WaCall) => {
    setBusyAnswer(true);
    try {
      const claimed = (await waCallsApi.claim(call.id)).data;
      if (!claimed.offer_sdp) throw new Error("The call has no audio offer");
      const leg = await answerOffer(claimed.offer_sdp, audioRef.current!);
      legRef.current = leg;
      setSession({
        callId: call.id,
        direction: "in",
        name: call.contact?.name ?? "Customer",
        conversationId: call.conversation_id,
        status: "answering",
        answeredAt: null,
      });
      await waCallsApi.answer(call.id, leg.sdp);
      setSession((s) => s && { ...s, status: "answered", answeredAt: Date.now() });
    } catch (err) {
      legRef.current?.close();
      legRef.current = null;
      setSession(null);
      void waCallsApi.hangup(call.id).catch(() => undefined); // let it ring for the others again
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: WA_CALLS_QK.RINGING });
    } finally {
      setBusyAnswer(false);
    }
  };

  const decline = async (call: WaCall) => {
    try {
      await waCallsApi.decline(call.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    void qc.invalidateQueries({ queryKey: WA_CALLS_QK.RINGING });
  };

  const hangup = async () => {
    const id = session?.callId ?? poll.data?.active?.id;
    if (!id) return;
    try {
      await waCallsApi.hangup(id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    cleanup();
  };

  const start = useCallback(
    async (conversationId: number, name: string) => {
      if (session) {
        toast.error("You're already on a call. Hang up first.");
        return;
      }
      let leg: Leg | null = null;
      try {
        leg = await createOffer(audioRef.current!);
        legRef.current = leg;
        const call = (await waCallsApi.start(conversationId, leg.sdp)).data;
        setSession({
          callId: call.id,
          direction: "out",
          name,
          conversationId,
          status: call.status,
          answeredAt: null,
        });
      } catch (err) {
        leg?.close();
        legRef.current = null;
        toast.error(errorMessage(err));
      }
    },
    [session]
  );

  const toggleMute = () => {
    const next = !muted;
    legRef.current?.mic.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  // a call of mine this tab doesn't hold (another tab, or the page was reloaded mid-call)
  const elsewhere = !session && poll.data?.active ? poll.data.active : null;
  const seconds = session?.answeredAt ? Math.max(0, Math.round((nowMs - session.answeredAt) / 1000)) : 0;

  return (
    <Ctx.Provider value={{ enabled, busy: !!session || !!elsewhere, start }}>
      {children}
      <audio ref={audioRef} autoPlay className="hidden" />
      {(incoming || session || elsewhere) && (
        <div
          className="fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))]"
          role="dialog"
          aria-live="assertive"
        >
          {session ? (
            <div className="border-line bg-surface flex items-center gap-3 rounded-2xl border p-3 shadow-2xl">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  session.status === "answered"
                    ? "bg-success-soft text-success"
                    : "bg-primary-soft text-primary"
                )}
              >
                <Phone className="h-5 w-5" aria-hidden />
              </span>
              <a
                href={CUSTOMER_ROUTES.INBOX({ c: session.conversationId })}
                className="min-w-0 flex-1 hover:underline"
              >
                <span className="text-fg block truncate text-sm font-semibold">{session.name}</span>
                <span className="text-fg-subtle block text-xs tabular-nums">
                  {session.status === "answered" ? clock(seconds) : (LABELS[session.status] ?? "Connecting…")}
                </span>
              </a>
              <Button
                iconOnly
                variant="secondary"
                size="sm"
                leftIcon={muted ? MicOff : Mic}
                aria-label={muted ? "Unmute" : "Mute"}
                aria-pressed={muted}
                onClick={toggleMute}
              />
              <Button
                iconOnly
                variant="danger"
                size="sm"
                leftIcon={PhoneOff}
                aria-label="Hang up"
                onClick={hangup}
              />
            </div>
          ) : incoming ? (
            <div className="border-line bg-surface rounded-2xl border p-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="bg-success-soft text-success flex h-11 w-11 shrink-0 animate-pulse items-center justify-center rounded-full">
                  <PhoneIncoming className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg-subtle text-xs">WhatsApp call</p>
                  <p className="text-fg truncate text-base font-semibold">
                    {incoming.contact?.name ?? "Customer"}
                  </p>
                  <p className="text-fg-subtle truncate text-xs">{incoming.contact?.phone}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="danger" leftIcon={PhoneOff} onClick={() => void decline(incoming)}>
                  Decline
                </Button>
                <Button leftIcon={Phone} loading={busyAnswer} onClick={() => void answer(incoming)}>
                  Answer
                </Button>
              </div>
            </div>
          ) : elsewhere ? (
            <div className="border-line bg-surface flex items-center gap-3 rounded-2xl border p-3 shadow-2xl">
              <Phone className="text-primary h-5 w-5" aria-hidden />
              <p className="text-fg min-w-0 flex-1 truncate text-sm">
                On a call with {elsewhere.contact?.name ?? "a customer"} in another tab
              </p>
              <Button size="sm" variant="danger" onClick={hangup}>
                Hang up
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Ctx.Provider>
  );
}
