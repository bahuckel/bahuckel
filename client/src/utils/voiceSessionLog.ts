/**
 * In-memory ring buffer for voice/WebRTC debugging (soft disconnects, signaling, ICE).
 * Enable via Settings → Admin → "Voice session trace", then Download or export with WebRTC snapshot.
 */

export type VoiceSessionLogEvent = {
  t: number;
  category: string;
  message: string;
  data?: unknown;
};

const MAX_EVENTS = 4000;
const events: VoiceSessionLogEvent[] = [];

let traceEnabled = false;

export function setVoiceSessionTraceEnabled(enabled: boolean): void {
  traceEnabled = enabled;
}

export function isVoiceSessionTraceEnabled(): boolean {
  return traceEnabled;
}

/** Append one line; no-ops when trace is off. */
export function voiceSessionLog(category: string, message: string, data?: unknown): void {
  if (!traceEnabled) return;
  try {
    events.push({ t: Date.now(), category, message, data });
    while (events.length > MAX_EVENTS) events.shift();
  } catch {
    /* ignore */
  }
}

export function getVoiceSessionLogSnapshot(): VoiceSessionLogEvent[] {
  return [...events];
}

export function clearVoiceSessionLog(): void {
  events.length = 0;
}

export function downloadVoiceSessionLog(): void {
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      note: 'Bahuckel voice session trace (signaling, members, ICE/connection state). Enable in Settings → Admin.',
      events: getVoiceSessionLogSnapshot(),
    },
    null,
    2
  );
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bahuckel-voice-session-${Date.now()}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const telemetryAttached = new WeakSet<RTCPeerConnection>();

/** Attach RTCPeerConnection state listeners (addEventListener — does not replace app ICE handlers). Idempotent per pc. */
export function attachVoicePeerTelemetry(peerId: string, pc: RTCPeerConnection): void {
  if (telemetryAttached.has(pc)) return;
  telemetryAttached.add(pc);
  const log = (label: string, extra?: Record<string, unknown>) => {
    voiceSessionLog('pc', `${peerId}: ${label}`, { peerId, ...extra });
  };
  log('peer registered', {
    signalingState: pc.signalingState,
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
  });
  pc.addEventListener('connectionstatechange', () => {
    log('connectionstatechange', { state: pc.connectionState });
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    log('iceconnectionstatechange', { iceConnectionState: pc.iceConnectionState });
  });
  pc.addEventListener('icegatheringstatechange', () => {
    log('icegatheringstatechange', { iceGatheringState: pc.iceGatheringState });
  });
  pc.addEventListener('signalingstatechange', () => {
    log('signalingstatechange', { signalingState: pc.signalingState });
  });
}
