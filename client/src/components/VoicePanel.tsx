import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useSettings } from '../context/SettingsContext';
import { playVoiceJoinSound } from '../utils/sound';
import { devWarn } from '../utils/devLog';
import {
  clearVoicePeerConnectionsRegistry,
  registerVoicePeerConnection,
  unregisterVoicePeerConnection,
} from '../utils/webrtcDiagnostics';
import { voiceSessionLog } from '../utils/voiceSessionLog';
import { sortVoiceMembersByJoinedAt } from '../utils/voiceChannelOrder';

interface VoiceMember {
  clientId: string;
  userId: string;
  userName: string;
  muted?: boolean;
  deafened?: boolean;
  joinedAt?: number;
}

interface VoicePanelProps {
  channelId: string;
  channelName: string;
  myClientId: string | null;
  send?: (msg: Record<string, unknown>) => void;
  subscribe?: (listener: (msg: Record<string, unknown>) => void) => () => void;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  peerVolumes?: Record<string, number>;
  screenShareStream?: MediaStream | null;
  screenShareBitrate?: number | null;
  screenShareThumbnailContainerId?: string;
  screenShareContainerRef?: React.RefObject<HTMLDivElement | null>;
  onSpeakingChange?: (clientIds: Set<string>) => void;
  onScreenShareCountChange?: (count: number) => void;
  onScreenShareClientsChange?: (clientIds: Set<string>) => void;
  viewingSharedFromClientId?: string | null;
  onViewingChange?: (clientId: string | null) => void;
}

export function VoicePanel({ channelId, channelName, myClientId, send: sendProp, subscribe: subscribeProp, voiceMuted = false, voiceDeafened = false, peerVolumes = {}, screenShareStream = null, screenShareBitrate, screenShareThumbnailContainerId, screenShareContainerRef, onSpeakingChange, onScreenShareCountChange, onScreenShareClientsChange, viewingSharedFromClientId = null, onViewingChange }: VoicePanelProps) {
  const socket = useSocket();
  const send = sendProp ?? socket.send;
  const subscribe = subscribeProp ?? socket.subscribe;
  const ready = socket.ready ?? false;
  const wsPingMs = socket.pingMs;
  const { settings } = useSettings();
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [joined, setJoined] = useState(false);
  const [micAllowed, setMicAllowed] = useState(false);
  const hasAutoJoinedRef = useRef(false);
  const wasInVoiceBeforeDisconnectRef = useRef(false);
  const joinedRef = useRef(false);
  const voiceSoundBaselineRef = useRef(false);
  const voiceSoundPrevIdsRef = useRef<Set<string>>(new Set());
  const prevReadyRef = useRef(ready);
  const localStreamRef = useRef<MediaStream | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeakingRef = useRef(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const screenShareAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const thumbnailVidRef = useRef<HTMLVideoElement | null>(null);
  const localScreenShareVidRef = useRef<HTMLVideoElement | null>(null);
  const peerVolumesRef = useRef<Record<string, number>>(peerVolumes);
  peerVolumesRef.current = peerVolumes;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const speakingRef = useRef<Set<string>>(new Set());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const viewingSharedRef = useRef<string | null>(viewingSharedFromClientId ?? null);
  viewingSharedRef.current = viewingSharedFromClientId ?? null;
  const voiceMutedRef = useRef(voiceMuted);
  const voiceDeafenedRef = useRef(voiceDeafened);
  voiceMutedRef.current = voiceMuted;
  voiceDeafenedRef.current = voiceDeafened;
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  screenShareStreamRef.current = screenShareStream;
  const onScreenShareCountChangeRef = useRef(onScreenShareCountChange);
  onScreenShareCountChangeRef.current = onScreenShareCountChange;
  const onScreenShareClientsChangeRef = useRef(onScreenShareClientsChange);
  onScreenShareClientsChangeRef.current = onScreenShareClientsChange;
  const membersRef = useRef<VoiceMember[]>([]);
  const pendingInitiatorPeersRef = useRef<Set<string>>(new Set());
  const voiceSoundDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVoiceSoundRef = useRef<{ nextIds: Set<string>; myId: string } | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  onSpeakingChangeRef.current = onSpeakingChange;

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    if (wsPingMs != null) voiceSessionLog('diag', 'ws pong latency (ms)', { pingMs: wsPingMs });
  }, [wsPingMs]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  useEffect(() => {
    voiceSoundBaselineRef.current = false;
    voiceSoundPrevIdsRef.current = new Set();
  }, [channelId]);

  /** Merge mute/deaf from voice_channel_state without re-subscribing voice_members / WebRTC (stable deps). */
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== 'voice_channel_state' || !msg.channels || typeof msg.channels !== 'object') return;
      const channels = msg.channels as Record<string, { clientId: string; userName: string; muted: boolean; deafened?: boolean; joinedAt?: number }[]>;
      const ch = channels[channelId];
      if (!ch?.length) return;
      const byId = new Map(ch.map((x) => [x.clientId, x]));
      setMembers((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((m) => {
          const s = byId.get(m.clientId);
          if (!s) return m;
          const dm = s.muted !== !!m.muted;
          const dd = (s.deafened ?? false) !== (m.deafened ?? false);
          if (!dm && !dd) return m;
          changed = true;
          voiceSessionLog('voice', 'mute/deafen from voice_channel_state', {
            clientId: m.clientId,
            userName: m.userName,
            muted: s.muted,
            deafened: s.deafened ?? false,
          });
          return { ...m, muted: s.muted, deafened: s.deafened ?? false };
        });
        return changed ? next : prev;
      });
    });
  }, [channelId, subscribe]);

  useEffect(() => {
    if (!ready) {
      voiceSoundBaselineRef.current = false;
      voiceSoundPrevIdsRef.current = new Set();
    }
  }, [ready]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== 'voice_members' || msg.channelId !== channelId) return;
      const list = sortVoiceMembersByJoinedAt((msg.members as VoiceMember[]) ?? []);
      const myId = myClientId;
      if (!myId) return;
      const nextIds = new Set(list.map((m) => m.clientId));
      pendingVoiceSoundRef.current = { nextIds, myId };
      if (voiceSoundDebounceRef.current) clearTimeout(voiceSoundDebounceRef.current);
      voiceSoundDebounceRef.current = setTimeout(() => {
        voiceSoundDebounceRef.current = null;
        const pending = pendingVoiceSoundRef.current;
        if (!pending) return;
        const ids = pending.nextIds;
        const mid = pending.myId;
        const joinSound = settingsRef.current.voiceJoinSound;
        const joinUrl = settingsRef.current.voiceJoinSoundUrl;
        if (!voiceSoundBaselineRef.current) {
          voiceSoundBaselineRef.current = true;
          voiceSoundPrevIdsRef.current = ids;
          if (ids.has(mid)) {
            playVoiceJoinSound(joinSound, joinUrl);
          }
        } else {
          const prev = voiceSoundPrevIdsRef.current;
          for (const id of ids) {
            if (!prev.has(id) && id !== mid) {
              playVoiceJoinSound(joinSound, joinUrl);
            }
          }
          voiceSoundPrevIdsRef.current = ids;
        }
      }, 500);
    });
  }, [subscribe, channelId, myClientId]);

  useEffect(() => {
    return () => {
      if (voiceSoundDebounceRef.current) clearTimeout(voiceSoundDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!onSpeakingChange) return;
    const next = new Set(speakingRef.current);
    let changed = false;
    for (const m of members) {
      if (m.muted && next.delete(m.clientId)) changed = true;
    }
    if (changed) {
      speakingRef.current = next;
      onSpeakingChange(next);
    }
  }, [members, onSpeakingChange]);

  const screenShareMaxBitrate = screenShareBitrate ?? 4_000_000;
  const getScreenShareContainer = useCallback((): HTMLDivElement | null => {
    if (screenShareContainerRef?.current) return screenShareContainerRef.current;
    return document.getElementById('voice-screen-share-main') as HTMLDivElement | null;
  }, [screenShareContainerRef]);

  const setScreenShareVideoBitrate = useCallback((pc: RTCPeerConnection, track: MediaStreamTrack) => {
    const sender = pc.getSenders().find((s) => s.track?.id === track.id);
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = screenShareMaxBitrate;
      sender.setParameters(params).catch(() => {});
    } catch (_) {}
  }, [screenShareMaxBitrate]);

  const drainIceQueue = useCallback((pc: RTCPeerConnection, peerId: string) => {
    const queue = iceCandidateQueueRef.current.get(peerId) ?? [];
    iceCandidateQueueRef.current.delete(peerId);
    queue.forEach((c) => {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch((err) => devWarn('addIceCandidate failed:', err));
    });
  }, []);

  /** Wait until joinVoice() has attached the processed mic stream; avoids recvonly answers with no sender. */
  const waitForLocalAudioStream = useCallback((maxMs = 20000) => {
    return new Promise<MediaStream | null>((resolve) => {
      const ready = () => {
        const s = localStreamRef.current;
        return s && s.getAudioTracks().length > 0 ? s : null;
      };
      const s0 = ready();
      if (s0) {
        resolve(s0);
        return;
      }
      const t0 = Date.now();
      const id = setInterval(() => {
        const s = ready();
        if (s) {
          clearInterval(id);
          resolve(s);
        } else if (Date.now() - t0 > maxMs) {
          clearInterval(id);
          resolve(null);
        }
      }, 50);
    });
  }, []);

  const joinVoice = useCallback(async () => {
    if (!myClientId || !ready) return;
    // Join the channel on the server first so we're allowed in even if mic is denied or unavailable (e.g. HTTP).
    voiceSessionLog('voice', 'join_voice', { channelId });
    send({ type: 'join_voice', channelId });
    setJoined(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      const gainNode = ctx.createGain();
      const g = settings.micVolume <= 0 ? 0 : settings.micVolume;
      gainNode.gain.setValueAtTime(g, ctx.currentTime);
      gainNodeRef.current = gainNode;
      const dest = ctx.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(dest);
      const data = new Float32Array(analyser.fftSize);
      gateIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !gainNodeRef.current) return;
        const s = settingsRef.current;
        const thresh = s.micSensitivity ?? -50;
        analyserRef.current.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length) || 1e-10;
        const dB = 20 * Math.log10(rms);
        const micVol = s.micVolume <= 0 ? 0 : s.micVolume;
        const open = dB >= thresh && micVol > 0;
        const transmitting = open && !voiceMutedRef.current && !voiceDeafenedRef.current;
        gainNodeRef.current.gain.setTargetAtTime(transmitting ? micVol : 0, ctx.currentTime, 0.02);
        localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = transmitting; });
        if (lastSpeakingRef.current !== transmitting) {
          lastSpeakingRef.current = transmitting;
          send({ type: 'voice_activity', channelId, speaking: transmitting });
          if (myClientId && onSpeakingChange) {
            const next = new Set(speakingRef.current);
            if (transmitting) next.add(myClientId);
            else next.delete(myClientId);
            speakingRef.current = next;
            onSpeakingChange(next);
          }
        }
      }, 50);
      const outStream = new MediaStream(dest.stream.getAudioTracks());
      outStream.getAudioTracks().forEach((track) => {
        track.enabled = g > 0;
      });
      localStreamRef.current = outStream;
      setMicAllowed(true);
      wasInVoiceBeforeDisconnectRef.current = true;
    } catch {
      setMicAllowed(false);
      send({ type: 'set_voice_muted', muted: true });
    }
  }, [channelId, myClientId, ready, send, settings.micVolume, settings.micSensitivity, onSpeakingChange]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== 'voice_members' || msg.channelId !== channelId) return;
      const list = sortVoiceMembersByJoinedAt((msg.members as VoiceMember[]) ?? []);
      voiceSessionLog('voice', 'voice_members', {
        channelId,
        count: list.length,
        order: list.map((m) => ({ clientId: m.clientId, userName: m.userName, joinedAt: m.joinedAt })),
      });
      setMembers(list);

      const myId = myClientId;
      if (!joined || !myId) return;
      const others = list.filter((m) => m.clientId !== myId);
      const existing = new Set(peersRef.current.keys());
      for (const m of others) {
        if (existing.has(m.clientId)) continue;
        const isInitiator = myId < m.clientId;
        if (!isInitiator) continue;
        if (pendingInitiatorPeersRef.current.has(m.clientId)) continue;
        pendingInitiatorPeersRef.current.add(m.clientId);
        void (async () => {
          try {
            const stream = await waitForLocalAudioStream();
            if (!stream) {
              devWarn('Voice: initiator skipped; no local audio in time for peer', m.clientId);
              return;
            }
            if (peersRef.current.has(m.clientId)) return;
            if (!membersRef.current.some((x) => x.clientId === m.clientId)) return;
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            const ss = screenShareStreamRef.current;
            if (ss) {
              ss.getVideoTracks().forEach((track) => {
                pc.addTrack(track, ss);
                setScreenShareVideoBitrate(pc, track);
              });
              ss.getAudioTracks().forEach((track) => pc.addTrack(track, ss));
            }
            pc.onicecandidate = (e) => {
              if (e.candidate) send({ type: 'webrtc_signal', toClientId: m.clientId, signal: { candidate: e.candidate } });
            };
            pc.oniceconnectionstatechange = () => {
              if (pc.iceConnectionState === 'failed' && typeof pc.restartIce === 'function') pc.restartIce();
            };
            pc.onnegotiationneeded = () => {
              pc.createOffer().then((offer) => {
                pc.setLocalDescription(offer);
                send({ type: 'webrtc_signal', toClientId: m.clientId, signal: { sdp: offer } });
              }).catch((err) => devWarn('Offer creation failed:', err));
            };
            pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
              const stream = e.streams?.[0] || new MediaStream([e.track]);
              const vid = document.createElement('video');
              vid.autoplay = true;
              vid.playsInline = true;
              vid.muted = true;
              vid.setAttribute('playsinline', '');
              vid.className = 'voice-screen-share-video';
              vid.dataset.clientId = m.clientId;
              vid.srcObject = stream;
              e.track.enabled = true;
              const tryAppend = (attempt: number) => {
                const container = getScreenShareContainer();
                if (container) {
                  container.appendChild(vid);
                  const viewing = viewingSharedRef.current;
                  vid.style.display = (viewing === m.clientId ? 'block' : 'none');
                  vid.style.width = '100%';
                  vid.style.height = '100%';
                  vid.style.objectFit = 'contain';
                } else if (attempt < 50) {
                  requestAnimationFrame(() => tryAppend(attempt + 1));
                }
              };
              tryAppend(0);
              vid.play().catch(() => {});
              vid.onloadedmetadata = () => { vid.play().catch(() => {}); };
              e.track.onended = () => {
                vid.srcObject = null;
                vid.remove();
                videoElsRef.current.delete(m.clientId);
                onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
                const ids = new Set(videoElsRef.current.keys());
                if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
                onScreenShareClientsChangeRef.current?.(ids);
              };
              videoElsRef.current.set(m.clientId, vid);
              onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
              const ids = new Set(videoElsRef.current.keys());
              if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
              onScreenShareClientsChangeRef.current?.(ids);
              const thumbContainer = screenShareThumbnailContainerId ? document.getElementById(screenShareThumbnailContainerId) : null;
              if (thumbContainer && stream) {
                thumbnailVidRef.current?.remove();
                const thumb = document.createElement('video');
                thumb.autoplay = true;
                thumb.playsInline = true;
                thumb.muted = true;
                thumb.className = 'voice-screen-share-thumbnail';
                thumb.srcObject = stream;
                thumbContainer.appendChild(thumb);
                thumb.play().catch(() => {});
                thumbnailVidRef.current = thumb;
              }
          } else {
            const stream = e.streams?.[0] || (e.track ? new MediaStream([e.track]) : null);
            const isScreenShareAudio = stream && stream.getVideoTracks().length > 0;
            const audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', '');
            const vol = voiceDeafenedRef.current ? 0 : (isScreenShareAudio
              ? (settingsRef.current.screenShareVolume ?? 1)
              : (peerVolumesRef.current[m.clientId] !== undefined && peerVolumesRef.current[m.clientId] !== null
                ? Number(peerVolumesRef.current[m.clientId])
                : (settingsRef.current.speakerVolume ?? 1)));
            audio.volume = Math.min(2, Math.max(0, Number.isFinite(vol) ? vol : 1));
            if (stream) audio.srcObject = stream;
            document.body.appendChild(audio);
            void audio.play().catch(() => {});
            if (isScreenShareAudio) screenShareAudioElsRef.current.set(m.clientId, audio);
            else audioElsRef.current.set(m.clientId, audio);
          }
            };
            peersRef.current.set(m.clientId, pc);
            registerVoicePeerConnection(m.clientId, pc);
          } finally {
            pendingInitiatorPeersRef.current.delete(m.clientId);
          }
        })();
      }
      for (const [cid] of peersRef.current) {
        if (!others.some((o) => o.clientId === cid)) {
          voiceSessionLog('voice', 'peer left channel', { channelId, peerId: cid });
          unregisterVoicePeerConnection(cid);
          peersRef.current.get(cid)?.close();
          peersRef.current.delete(cid);
          iceCandidateQueueRef.current.delete(cid);
          audioElsRef.current.get(cid)?.remove();
          audioElsRef.current.delete(cid);
          screenShareAudioElsRef.current.get(cid)?.remove();
          screenShareAudioElsRef.current.delete(cid);
          videoElsRef.current.get(cid)?.remove();
          videoElsRef.current.delete(cid);
        }
      }
      const thumbContainer = screenShareThumbnailContainerId ? document.getElementById(screenShareThumbnailContainerId) : null;
      if (thumbContainer) {
        const first = videoElsRef.current.values().next().value;
        if (first?.srcObject) {
          thumbnailVidRef.current?.remove();
          const thumb = document.createElement('video');
          thumb.autoplay = true;
          thumb.playsInline = true;
          thumb.muted = true;
          thumb.className = 'voice-screen-share-thumbnail';
          thumb.srcObject = first.srcObject;
          thumbContainer.appendChild(thumb);
          thumb.play().catch(() => {});
          thumbnailVidRef.current = thumb;
        } else {
          thumbnailVidRef.current?.remove();
          thumbnailVidRef.current = null;
        }
      }
      onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
      const ids = new Set(videoElsRef.current.keys());
      if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
      onScreenShareClientsChangeRef.current?.(ids);
    });
  }, [channelId, joined, myClientId, send, subscribe, screenShareThumbnailContainerId, setScreenShareVideoBitrate, getScreenShareContainer, waitForLocalAudioStream]);

  useEffect(() => {
    if (!onSpeakingChange) return;
    return subscribe((msg) => {
      if (msg.type !== 'voice_activity' || msg.channelId !== channelId) return;
      const cid = msg.clientId as string;
      const speaking = !!msg.speaking;
      if (speaking && membersRef.current.find((m) => m.clientId === cid)?.muted) return;
      const next = new Set(speakingRef.current);
      if (speaking) next.add(cid);
      else next.delete(cid);
      speakingRef.current = next;
      onSpeakingChange(next);
    });
  }, [channelId, subscribe, onSpeakingChange]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== 'screen_share_ended' || msg.channelId !== channelId || typeof msg.clientId !== 'string') return;
      const endedId = msg.clientId as string;
      const vid = videoElsRef.current.get(endedId);
      if (vid) {
        vid.srcObject = null;
        vid.remove();
        videoElsRef.current.delete(endedId);
      }
      screenShareAudioElsRef.current.get(endedId)?.remove();
      screenShareAudioElsRef.current.delete(endedId);
      onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
      const ids = new Set(videoElsRef.current.keys());
      if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
      onScreenShareClientsChangeRef.current?.(ids);
    });
  }, [channelId, subscribe, myClientId]);

  useEffect(() => {
    const attachWebrtcPeerHandlers = (conn: RTCPeerConnection, remoteId: string) => {
      conn.onicecandidate = (e) => {
        if (e.candidate) send({ type: 'webrtc_signal', toClientId: remoteId, signal: { candidate: e.candidate } });
      };
      conn.oniceconnectionstatechange = () => {
        if (conn.iceConnectionState === 'failed' && typeof conn.restartIce === 'function') conn.restartIce();
      };
      /* Only smaller clientId sends offers; answerer must not negotiate a competing offer (fixes one-way voice). */
      conn.onnegotiationneeded = () => {
        if (!myClientId || !remoteId || myClientId >= remoteId) return;
        conn.createOffer().then((offer) => {
          conn.setLocalDescription(offer);
          send({ type: 'webrtc_signal', toClientId: remoteId, signal: { sdp: offer } });
        }).catch((err) => devWarn('Offer creation failed:', err));
      };
      conn.ontrack = (e) => {
        if (e.track.kind === 'video') {
          const stream = e.streams?.[0] || new MediaStream([e.track]);
          const vid = document.createElement('video');
          vid.autoplay = true;
          vid.playsInline = true;
          vid.muted = true;
          vid.setAttribute('playsinline', '');
          vid.className = 'voice-screen-share-video';
          vid.dataset.clientId = remoteId;
          vid.srcObject = stream;
          e.track.enabled = true;
          const tryAppend = (attempt: number) => {
            const container = getScreenShareContainer();
            if (container) {
              container.appendChild(vid);
              const viewing = viewingSharedRef.current;
              vid.style.display = (viewing === remoteId ? 'block' : 'none');
              vid.style.width = '100%';
              vid.style.height = '100%';
              vid.style.objectFit = 'contain';
            } else if (attempt < 50) {
              requestAnimationFrame(() => tryAppend(attempt + 1));
            }
          };
          tryAppend(0);
          vid.play().catch(() => {});
          vid.onloadedmetadata = () => { vid.play().catch(() => {}); };
          e.track.onended = () => {
            vid.srcObject = null;
            vid.remove();
            videoElsRef.current.delete(remoteId);
            onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
            const ids = new Set(videoElsRef.current.keys());
            if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
            onScreenShareClientsChangeRef.current?.(ids);
          };
          videoElsRef.current.set(remoteId, vid);
          onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
          const ids = new Set(videoElsRef.current.keys());
          if (screenShareStreamRef.current && myClientId) ids.add(myClientId);
          onScreenShareClientsChangeRef.current?.(ids);
          const thumbContainer = screenShareThumbnailContainerId ? document.getElementById(screenShareThumbnailContainerId) : null;
          if (thumbContainer && stream) {
            thumbnailVidRef.current?.remove();
            const thumb = document.createElement('video');
            thumb.autoplay = true;
            thumb.playsInline = true;
            thumb.muted = true;
            thumb.className = 'voice-screen-share-thumbnail';
            thumb.srcObject = stream;
            thumbContainer.appendChild(thumb);
            thumb.play().catch(() => {});
            thumbnailVidRef.current = thumb;
          }
        } else {
          const stream = e.streams?.[0] || (e.track ? new MediaStream([e.track]) : null);
          const isScreenShareAudio = stream && stream.getVideoTracks().length > 0;
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', '');
          const vol = voiceDeafenedRef.current ? 0 : (isScreenShareAudio
            ? (settingsRef.current.screenShareVolume ?? 1)
            : (peerVolumesRef.current[remoteId] !== undefined && peerVolumesRef.current[remoteId] !== null
              ? Number(peerVolumesRef.current[remoteId])
              : (settingsRef.current.speakerVolume ?? 1)));
          audio.volume = Math.min(2, Math.max(0, Number.isFinite(vol) ? vol : 1));
          if (stream) audio.srcObject = stream;
          document.body.appendChild(audio);
          void audio.play().catch(() => {});
          if (isScreenShareAudio) screenShareAudioElsRef.current.set(remoteId, audio);
          else audioElsRef.current.set(remoteId, audio);
        }
      };
    };

    return subscribe((msg) => {
      if (msg.type !== 'webrtc_signal' || !msg.fromClientId || !msg.signal) return;
      const from = msg.fromClientId as string;
      let pc = peersRef.current.get(from);
      const signal = msg.signal as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      voiceSessionLog('signal', 'webrtc_signal in', {
        from,
        sdpType: signal.sdp?.type,
        hasCandidate: !!signal.candidate,
      });
      if (signal.sdp) {
        const sdp = signal.sdp as RTCSessionDescriptionInit;
        const drain = () => drainIceQueue(pc!, from);

        if (!pc && sdp.type === 'offer') {
          /* Answerer: wait for mic, then setRemoteDescription(offer) before addTrack (recvonly answers if mic was late). */
          pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          attachWebrtcPeerHandlers(pc, from);
          peersRef.current.set(from, pc);
          registerVoicePeerConnection(from, pc);
          waitForLocalAudioStream()
            .then((stream) => {
              if (!stream) {
                devWarn('Voice: no local audio before answering offer from', from);
                unregisterVoicePeerConnection(from);
                peersRef.current.delete(from);
                pc?.close();
                return Promise.reject(new Error('no local audio'));
              }
              return pc!.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
                drainIceQueue(pc!, from);
                stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
                const ssOffer = screenShareStreamRef.current;
                if (ssOffer) {
                  ssOffer.getVideoTracks().forEach((track) => {
                    pc!.addTrack(track, ssOffer);
                    setScreenShareVideoBitrate(pc!, track);
                  });
                  ssOffer.getAudioTracks().forEach((track) => pc!.addTrack(track, ssOffer));
                }
                return pc!.createAnswer();
              });
            })
            .then((answer) => {
              if (!answer) return;
              return pc!.setLocalDescription(answer).then(() => {
                send({ type: 'webrtc_signal', toClientId: from, signal: { sdp: answer } });
              });
            })
            .catch((err) => {
              if (String(err?.message || err) !== 'no local audio') devWarn('Offer/answer failed:', err);
            });
        } else {
          if (!pc) {
            void waitForLocalAudioStream().then((stream) => {
              if (peersRef.current.get(from)) return;
              if (!stream) {
                devWarn('Voice: no local audio before handling remote SDP from', from);
                return;
              }
              const npc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
              stream.getTracks().forEach((track) => npc.addTrack(track, stream));
              const ssNpc = screenShareStreamRef.current;
              if (ssNpc) {
                ssNpc.getVideoTracks().forEach((track) => {
                  npc.addTrack(track, ssNpc);
                  setScreenShareVideoBitrate(npc, track);
                });
                ssNpc.getAudioTracks().forEach((track) => npc.addTrack(track, ssNpc));
              }
              attachWebrtcPeerHandlers(npc, from);
              peersRef.current.set(from, npc);
              registerVoicePeerConnection(from, npc);
              const drainNpc = () => drainIceQueue(npc, from);
              if (sdp.type === 'offer') {
                npc.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
                  drainNpc();
                  return npc.createAnswer();
                }).then((answer) => {
                  return npc.setLocalDescription(answer).then(() => {
                    send({ type: 'webrtc_signal', toClientId: from, signal: { sdp: answer } });
                  });
                }).catch((err) => devWarn('Offer/answer failed:', err));
              } else {
                npc.setRemoteDescription(new RTCSessionDescription(sdp)).then(drainNpc).catch((err) => devWarn('setRemoteDescription failed:', err));
              }
            });
            return;
          }
          if (sdp.type === 'offer') {
            pc!.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
              drain();
              return pc!.createAnswer();
            }).then((answer) => {
              return pc!.setLocalDescription(answer).then(() => {
                send({ type: 'webrtc_signal', toClientId: from, signal: { sdp: answer } });
              });
            }).catch((err) => devWarn('Offer/answer failed:', err));
          } else {
            pc!.setRemoteDescription(new RTCSessionDescription(sdp)).then(drain).catch((err) => devWarn('setRemoteDescription failed:', err));
          }
        }
      }
      if (signal.candidate && pc) {
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch((err) => console.warn('addIceCandidate failed:', err));
        } else {
          const queue = iceCandidateQueueRef.current.get(from) ?? [];
          queue.push(signal.candidate);
          iceCandidateQueueRef.current.set(from, queue);
        }
      }
    });
  }, [send, subscribe, drainIceQueue, setScreenShareVideoBitrate, getScreenShareContainer, myClientId, waitForLocalAudioStream, screenShareThumbnailContainerId]);

  const prevScreenShareRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!screenShareStream && prevScreenShareRef.current) {
      prevScreenShareRef.current = null;
      const others = members.filter((m) => m.clientId !== myClientId);
      for (const m of others) {
        const pc = peersRef.current.get(m.clientId);
        if (!pc) continue;
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          pc.removeTrack(sender);
          const isInitiator = myClientId && m.clientId && myClientId < m.clientId;
          if (isInitiator) {
            pc.createOffer().then((offer) => {
              pc.setLocalDescription(offer);
              send({ type: 'webrtc_signal', toClientId: m.clientId, signal: { sdp: offer } });
            });
          }
        }
        /* Do NOT remove peer video elements - those show incoming streams from others. We only stopped sending. */
      }
      thumbnailVidRef.current?.remove();
      thumbnailVidRef.current = null;
      onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
      onScreenShareClientsChangeRef.current?.(new Set(videoElsRef.current.keys()));
      return;
    }
    prevScreenShareRef.current = screenShareStream ?? null;
    if (!screenShareStream || !joined || !myClientId) return;
    const videoTracks = screenShareStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const videoTrack = videoTracks[0];
    const others = members.filter((m) => m.clientId !== myClientId);
    for (const m of others) {
      const pc = peersRef.current.get(m.clientId);
      if (!pc) continue;
      if (pc.getSenders().some((s) => s.track?.id === videoTrack.id)) continue;
      pc.addTrack(videoTrack, screenShareStream);
      setScreenShareVideoBitrate(pc, videoTrack);
      screenShareStream.getAudioTracks().forEach((track) => pc.addTrack(track, screenShareStream));
      // onnegotiationneeded will fire and create/send the offer (initiator only)
    }
  }, [screenShareStream, joined, myClientId, members, send, setScreenShareVideoBitrate]);

  // Update video visibility when viewingSharedFromClientId changes (TASK 4)
  useEffect(() => {
    const viewing = viewingSharedFromClientId ?? null;
    videoElsRef.current.forEach((vid, clientId) => {
      try { vid.style.display = (viewing === clientId ? 'block' : 'none'); } catch (_) {}
    });
    const local = localScreenShareVidRef.current;
    if (local && myClientId) {
      try { local.style.display = (viewing === myClientId ? 'block' : 'none'); } catch (_) {}
    }
  }, [viewingSharedFromClientId, myClientId]);

  // Notify when local user starts sharing (so monitor icon appears immediately)
  useEffect(() => {
    if (!onScreenShareClientsChangeRef.current) return;
    const ids = new Set(videoElsRef.current.keys());
    if (screenShareStream && myClientId) ids.add(myClientId);
    onScreenShareClientsChangeRef.current(ids);
  }, [screenShareStream, myClientId]);

  // Render local user's screen share so they can see their own screen (integrated only)
  useEffect(() => {
    if (!screenShareStream || !myClientId) {
      const el = localScreenShareVidRef.current;
      if (el) {
        el.srcObject = null;
        el.remove();
        localScreenShareVidRef.current = null;
      }
      return;
    }
    const vid = document.createElement('video');
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = true;
    vid.setAttribute('playsinline', '');
    vid.className = 'voice-screen-share-video';
    vid.dataset.clientId = myClientId;
    vid.dataset.local = 'true';
    vid.srcObject = screenShareStream;
    const viewing = viewingSharedRef.current;
    vid.style.display = (viewing === myClientId ? 'block' : 'none');
    vid.style.width = '100%';
    vid.style.height = '100%';
    vid.style.objectFit = 'contain';
    const tryAppend = (attempt: number) => {
      const container = getScreenShareContainer();
      if (container) {
        container.appendChild(vid);
        vid.play().catch(() => {});
        localScreenShareVidRef.current = vid;
      } else if (attempt < 50) {
        requestAnimationFrame(() => tryAppend(attempt + 1));
      }
    };
    tryAppend(0);
    const onEnded = () => {
      vid.srcObject = null;
      vid.remove();
      if (localScreenShareVidRef.current === vid) localScreenShareVidRef.current = null;
      onScreenShareCountChangeRef.current?.(videoElsRef.current.size);
      onScreenShareClientsChangeRef.current?.(new Set(videoElsRef.current.keys()));
    };
    vid.onended = onEnded;
    screenShareStream.getVideoTracks()[0]?.addEventListener('ended', onEnded);
    return () => {
      screenShareStream.getVideoTracks()[0]?.removeEventListener('ended', onEnded);
      vid.srcObject = null;
      vid.remove();
      localScreenShareVidRef.current = null;
    };
  }, [screenShareStream, myClientId, getScreenShareContainer]);

  useEffect(() => {
    if (!gateIntervalRef.current) {
      const t = setTimeout(() => {
        if (gainNodeRef.current && localStreamRef.current) {
          const g = settings.micVolume <= 0 ? 0 : settings.micVolume;
          const ctx = gainNodeRef.current.context;
          gainNodeRef.current.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
          localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = g > 0;
          });
        }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [settings.micVolume]);

  useEffect(() => {
    const vols = peerVolumesRef.current;
    audioElsRef.current.forEach((el, clientId) => {
      try {
        const v = voiceDeafened ? 0 : (vols[clientId] !== undefined && vols[clientId] !== null
          ? Number(vols[clientId])
          : (settings.speakerVolume ?? 1));
        const vol = Math.min(2, Math.max(0, Number.isFinite(v) ? v : 1));
        el.volume = vol;
      } catch (_) { el.volume = 1; }
    });
    const screenVol = voiceDeafened ? 0 : (settings.screenShareVolume ?? 1);
    screenShareAudioElsRef.current.forEach((el) => {
      try { el.volume = Math.min(2, Math.max(0, screenVol)); } catch (_) { el.volume = 1; }
    });
  }, [settings.speakerVolume, settings.screenShareVolume, voiceDeafened, peerVolumes]);

  useEffect(() => {
    if (ready && prevReadyRef.current === false) {
      prevReadyRef.current = true;
    } else if (!ready && prevReadyRef.current === true) {
      wasInVoiceBeforeDisconnectRef.current = joined;
      prevReadyRef.current = false;
    } else if (ready) {
      prevReadyRef.current = true;
    }
  }, [ready, joined]);

  useEffect(() => {
    if (ready && myClientId && !hasAutoJoinedRef.current) {
      hasAutoJoinedRef.current = true;
      joinVoice();
    }
    return () => {
      hasAutoJoinedRef.current = false;
    };
  }, [channelId, ready, myClientId, joinVoice]);

  /** Only [channelId]: do not list `send` here — it used to change every SocketProvider render (e.g. every WS pong) and spuriously fired leave/join. */
  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        voiceSessionLog('voice', 'leave_voice', { channelId });
        sendRef.current({ type: 'leave_voice', channelId });
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
        clearVoicePeerConnectionsRegistry();
        pendingInitiatorPeersRef.current.clear();
        audioElsRef.current.forEach((el) => el.remove());
        audioElsRef.current.clear();
        screenShareAudioElsRef.current.forEach((el) => el.remove());
        screenShareAudioElsRef.current.clear();
        videoElsRef.current.forEach((el) => el.remove());
        videoElsRef.current.clear();
        speakingRef.current = new Set();
        onSpeakingChangeRef.current?.(new Set());
      }
    };
  }, [channelId]);

  useEffect(() => {
    if (joined) send({ type: 'set_voice_muted', muted: voiceMuted });
  }, [voiceMuted, joined, send]);

  useEffect(() => {
    if (joined) send({ type: 'set_voice_deafened', deafened: voiceDeafened });
  }, [voiceDeafened, joined, send]);

  return null;
}
