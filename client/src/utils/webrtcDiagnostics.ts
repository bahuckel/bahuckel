import { getHttpApiOrigin, getWebSocketUrl } from './serverOrigin';
import { attachVoicePeerTelemetry, getVoiceSessionLogSnapshot, type VoiceSessionLogEvent } from './voiceSessionLog';

/**
 * Registers active voice RTCPeerConnections so Admin can export a chrome://webrtc-internals–style JSON snapshot.
 */
const registeredPeers = new Map<string, RTCPeerConnection>();

export function registerVoicePeerConnection(peerId: string, pc: RTCPeerConnection): void {
  registeredPeers.set(peerId, pc);
  attachVoicePeerTelemetry(peerId, pc);
}

export function unregisterVoicePeerConnection(peerId: string): void {
  registeredPeers.delete(peerId);
}

export function clearVoicePeerConnectionsRegistry(): void {
  registeredPeers.clear();
}

function statReportToPlain(stats: RTCStatsReport): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  stats.forEach((report) => {
    const entry: Record<string, unknown> = {};
    const r = report as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (typeof val === 'bigint') entry[key] = val.toString();
      else if (val !== undefined) entry[key] = val;
    }
    const id = typeof r.id === 'string' && r.id ? r.id : `_stat_${Object.keys(out).length}`;
    out[id] = entry;
  });
  return out;
}

function describeTransceivers(pc: RTCPeerConnection): unknown[] {
  return pc.getTransceivers().map((t, index) => ({
    index,
    mid: t.mid,
    direction: t.direction,
    currentDirection: t.currentDirection,
    receiver: {
      trackId: t.receiver.track?.id,
      kind: t.receiver.track?.kind,
      enabled: t.receiver.track?.enabled,
      muted: t.receiver.track?.muted,
    },
    sender: {
      trackId: t.sender.track?.id,
      kind: t.sender.track?.kind,
      enabled: t.sender.track?.enabled,
    },
  }));
}

async function serializePeer(peerId: string, pc: RTCPeerConnection): Promise<Record<string, unknown>> {
  let stats: Record<string, Record<string, unknown>> = {};
  try {
    const r = await pc.getStats();
    stats = statReportToPlain(r);
  } catch (e) {
    stats = { _getStats_error: { message: String(e) } };
  }

  const local = pc.localDescription;
  const remote = pc.remoteDescription;

  return {
    peerId,
    signalingState: pc.signalingState,
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    canTrickleIceCandidates: pc.canTrickleIceCandidates,
    rtcConfiguration: pc.getConfiguration(),
    localDescription: local ? { type: local.type, sdp: local.sdp } : null,
    remoteDescription: remote ? { type: remote.type, sdp: remote.sdp } : null,
    transceivers: describeTransceivers(pc),
    getStats: stats,
  };
}

export type WebRtcDiagnosticsDump = {
  exportedAt: string;
  userAgent: string;
  locationHref: string;
  connection: {
    httpApiOrigin: string;
    webSocketUrl: string;
    electronGetServerUrl: string | null;
  };
  peerConnections: Record<string, Record<string, unknown>>;
  /** Populated when Voice session trace was enabled during the session. */
  voiceSessionLog: VoiceSessionLogEvent[];
  note: string;
};

export async function buildWebRtcDiagnosticsDump(): Promise<WebRtcDiagnosticsDump> {
  let electronUrl: string | null = null;
  try {
    const w = window as Window & { bahuckel?: { getServerUrl?: () => string } };
    const u = w.bahuckel?.getServerUrl?.();
    electronUrl = u && u.trim() ? u.trim() : null;
  } catch {
    electronUrl = null;
  }

  const peerConnections: Record<string, Record<string, unknown>> = {};
  const entries = [...registeredPeers.entries()];
  for (const [peerId, pc] of entries) {
    peerConnections[peerId] = await serializePeer(peerId, pc);
  }

  return {
    exportedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    locationHref: typeof location !== 'undefined' ? location.href : '',
    connection: {
      httpApiOrigin: getHttpApiOrigin(),
      webSocketUrl: getWebSocketUrl(),
      electronGetServerUrl: electronUrl,
    },
    peerConnections,
    voiceSessionLog: getVoiceSessionLogSnapshot(),
    note:
      'Bahuckel client WebRTC snapshot. Join a voice channel with at least one remote peer before exporting for meaningful peer stats. Enable Voice session trace (Settings → Admin) to log signaling and connection state even when peerConnections is empty.',
  };
}

export async function downloadWebRtcDiagnosticsSnapshot(): Promise<void> {
  const dump = await buildWebRtcDiagnosticsDump();
  const json = JSON.stringify(dump, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bahuckel-webrtc-diagnostics-${Date.now()}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
