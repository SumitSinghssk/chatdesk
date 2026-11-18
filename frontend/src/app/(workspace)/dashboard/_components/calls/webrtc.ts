/** WebRTC for WhatsApp calls: the browser is the audio endpoint (Opus over DTLS-SRTP), SDP goes through Meta. */

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_WAIT_MS = 3000;

export class MicBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicBlockedError";
  }
}

/** Meta wants the whole SDP in one go (no trickle ICE): wait for gathering, at most 3 s. */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

async function getMic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicBlockedError(
      "This browser can't use a microphone here. Open ChatDesk over https in Chrome, Edge or Safari."
    );
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new MicBlockedError(
        "The microphone is blocked. Allow it for ChatDesk in the address bar, then try again."
      );
    if (name === "NotFoundError")
      throw new MicBlockedError("No microphone found. Plug in a headset and try again.");
    throw new MicBlockedError("Couldn't start the microphone. Check another app isn't using it.");
  }
}

export interface Leg {
  pc: RTCPeerConnection;
  mic: MediaStream;
  sdp: string;
  close: () => void;
}

function leg(pc: RTCPeerConnection, mic: MediaStream, audio: HTMLAudioElement, sdp: string): Leg {
  return {
    pc,
    mic,
    sdp,
    close: () => {
      pc.close();
      mic.getTracks().forEach((t) => t.stop());
      audio.srcObject = null;
    },
  };
}

function playRemote(pc: RTCPeerConnection, audio: HTMLAudioElement) {
  pc.addEventListener("track", (e) => {
    audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    void audio.play().catch(() => undefined);
  });
}

/** Incoming call: answer the customer's offer with the microphone. */
export async function answerOffer(offerSdp: string, audio: HTMLAudioElement): Promise<Leg> {
  const mic = await getMic();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  try {
    playRemote(pc, audio);
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    return leg(pc, mic, audio, pc.localDescription?.sdp ?? answer.sdp ?? "");
  } catch (err) {
    pc.close();
    mic.getTracks().forEach((t) => t.stop());
    throw err;
  }
}

/** Outgoing call: an offer with the microphone; the customer's answer comes back later. */
export async function createOffer(audio: HTMLAudioElement): Promise<Leg> {
  const mic = await getMic();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  try {
    playRemote(pc, audio);
    mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    return leg(pc, mic, audio, pc.localDescription?.sdp ?? offer.sdp ?? "");
  } catch (err) {
    pc.close();
    mic.getTracks().forEach((t) => t.stop());
    throw err;
  }
}

/** A ringing sound made in the browser (two short tones every 2 s), until stop() is called. */
export function startRingtone(): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => undefined;
  }
  const beep = (at: number) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 480;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.4);
  };
  const ring = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    beep(t);
    beep(t + 0.45);
  };
  ring();
  const timer = setInterval(ring, 2000);
  return () => {
    clearInterval(timer);
    void ctx?.close().catch(() => undefined);
    ctx = null;
  };
}
