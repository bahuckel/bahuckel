import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../context/SettingsContext';
import { devWarn } from '../utils/devLog';
import { Avatar } from './Avatar';
import { IconChevronDown, IconMic, IconMicOff, IconMonitor, IconPhoneOff, IconSettings, IconVolume2, IconVolumeX, IconWifi } from './UiIcons';

interface UserControlsBarProps {
  currentUsername?: string | null;
  userColors?: Record<string, string>;
  avatarCacheBust?: number;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onVoiceMute?: () => void;
  onVoiceDeafen?: () => void;
  onOpenSettings?: () => void;
  onStartScreenShare?: (stream: MediaStream, kind: 'screen' | 'window' | 'camera', options?: { bitrate?: number }) => void;
  onStopScreenShare?: () => void;
  screenSharing?: boolean;
  /** Only show screen share when in a voice channel. When false, hide the screen share button. */
  showScreenShare?: boolean;
  hasScreenShare?: boolean;
  /** Voice channel display name when connected. */
  voiceChannelName?: string | null;
  /** WebSocket RTT in ms (from server ping). */
  pingMs?: number | null;
  /** Leave the voice channel (hang up). */
  onLeaveVoice?: () => void;
}

export function UserControlsBar({
  currentUsername,
  userColors = {},
  avatarCacheBust,
  voiceMuted = false,
  voiceDeafened = false,
  onVoiceMute,
  onVoiceDeafen,
  onOpenSettings,
  onStartScreenShare,
  onStopScreenShare,
  screenSharing = false,
  showScreenShare = true,
  hasScreenShare = false,
  voiceChannelName = null,
  pingMs = null,
  onLeaveVoice,
}: UserControlsBarProps) {
  const ctx = useSettings();
  const settings = ctx?.settings;
  const setMicVolume = ctx?.setMicVolume;
  const setSpeakerVolume = ctx?.setSpeakerVolume;

  const [userCtrlDropdown, setUserCtrlDropdown] = useState<'mic' | 'headphone' | 'screenshare' | null>(null);
  const [userCtrlAnchor, setUserCtrlAnchor] = useState<DOMRect | null>(null);
  const [screenShareResolution, setScreenShareResolution] = useState<'720p' | '1080p' | 'source'>('1080p');
  const [screenShareFps, setScreenShareFps] = useState<30 | 60 | 'source'>(30);
  const [screenShareBitrate, setScreenShareBitrate] = useState<number>(4_000_000);
  const [screenShareBitrateCustom, setScreenShareBitrateCustom] = useState<string>('');
  const [screenShareTab, setScreenShareTab] = useState<'screens' | 'windows'>('screens');
  const [screenShareToast, setScreenShareToast] = useState<string | null>(null);
  const shareInProgressRef = useRef(false);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.user-controls-bar') || t.closest('.user-controls-bar-wrap') || t.closest('.user-ctrl-dropdown')) return;
      window.setTimeout(() => {
        setUserCtrlDropdown(null);
        setUserCtrlAnchor(null);
      }, 0);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, []);

  if (!currentUsername) return null;

  const pingTone =
    pingMs == null ? 'ping-unknown' : pingMs > 250 ? 'ping-bad' : pingMs > 100 ? 'ping-warn' : 'ping-good';

  return (
    <>
      {screenShareToast && (
        <div className="screen-share-toast" role="status" aria-live="polite">
          {screenShareToast}
        </div>
      )}
      <div className="user-controls-bar-wrap">
        <div className="user-controls-bar user-controls-bar-row-top">
          <div className="user-controls-avatar">
            <Avatar
              username={currentUsername}
              cacheBust={avatarCacheBust}
              imgClassName="user-controls-avatar-img"
              initialClassName="user-controls-avatar-initial"
            />
          </div>
          <div className="user-controls-info">
            <span className="user-controls-username" style={userColors[currentUsername] ? { color: userColors[currentUsername] } : undefined}>
              {currentUsername}
            </span>
            {voiceChannelName ? (
              <span className="user-controls-voice-label" title={`Voice: ${voiceChannelName}`}>
                <span className="user-controls-voice-prefix">Voice</span>
                <span className="user-controls-voice-name">{voiceChannelName}</span>
              </span>
            ) : (
              <span className="user-controls-voice-label muted">Not in voice</span>
            )}
          </div>
          <div className={`user-controls-ping ${pingTone}`} title={pingMs != null ? `Latency: ${pingMs} ms` : 'Latency'}>
            <IconWifi className="user-controls-ping-icon" />
            <span className="user-controls-ping-ms">{pingMs != null ? `${pingMs}` : '—'}</span>
          </div>
        </div>
        <div className="user-controls-bar-divider" aria-hidden />
        <div
          className={`user-controls-bar user-controls-bar-row-actions${voiceChannelName ? '' : ' user-controls-bar-row-actions--idle'}`}
        >
          <div className="user-controls-actions">
            <div className="user-ctrl-btn-wrap">
              <button
                type="button"
                className={`user-ctrl-btn ${voiceMuted ? 'muted' : ''}`}
                onClick={() => onVoiceMute?.()}
                title={voiceMuted ? 'Unmute' : 'Mute'}
                aria-label={voiceMuted ? 'Unmute' : 'Mute'}
              >
                {voiceMuted ? <IconMicOff /> : <IconMic />}
              </button>
              <button
                type="button"
                className="user-ctrl-arrow"
                onClick={(e) => { e.stopPropagation(); setUserCtrlDropdown((d) => (d === 'mic' ? null : 'mic')); setUserCtrlAnchor(e.currentTarget.getBoundingClientRect()); }}
                aria-label="Microphone settings"
              >
                <IconChevronDown />
              </button>
            </div>
            <div className="user-ctrl-btn-wrap">
              <button
                type="button"
                className={`user-ctrl-btn ${voiceDeafened ? 'deafened' : ''}`}
                onClick={() => onVoiceDeafen?.()}
                title={voiceDeafened ? 'Undeafen' : 'Deafen'}
                aria-label={voiceDeafened ? 'Undeafen' : 'Deafen'}
              >
                {voiceDeafened ? <IconVolumeX /> : <IconVolume2 />}
              </button>
              <button
                type="button"
                className="user-ctrl-arrow"
                onClick={(e) => { e.stopPropagation(); setUserCtrlDropdown((d) => (d === 'headphone' ? null : 'headphone')); setUserCtrlAnchor(e.currentTarget.getBoundingClientRect()); }}
                aria-label="Headphone settings"
              >
                <IconChevronDown />
              </button>
            </div>
            {voiceChannelName && (
              <button
                type="button"
                className="user-ctrl-btn user-ctrl-leave-call"
                title="Leave voice channel"
                aria-label="Leave voice channel"
                onClick={() => onLeaveVoice?.()}
              >
                <IconPhoneOff />
              </button>
            )}
            {showScreenShare && (
              <div className="user-ctrl-btn-wrap">
                <button
                  type="button"
                  className={`user-ctrl-btn ${screenSharing ? 'active' : ''}`}
                  title={screenSharing ? 'Stop sharing' : 'Share screen'}
                  aria-label={screenSharing ? 'Stop sharing' : 'Share screen'}
                  onClick={(e) => {
                    if (screenSharing) {
                      onStopScreenShare?.();
                    } else {
                      e.stopPropagation();
                      setUserCtrlDropdown((d) => (d === 'screenshare' ? null : 'screenshare'));
                      setUserCtrlAnchor(e.currentTarget.getBoundingClientRect());
                    }
                  }}
                >
                  <IconMonitor />
                </button>
                <button
                  type="button"
                  className="user-ctrl-arrow"
                  onClick={(e) => { e.stopPropagation(); setUserCtrlDropdown((d) => (d === 'screenshare' ? null : 'screenshare')); setUserCtrlAnchor(e.currentTarget.getBoundingClientRect()); }}
                  aria-label="Screen share options"
                >
                  <IconChevronDown />
                </button>
              </div>
            )}
            <button type="button" className="user-ctrl-btn user-ctrl-settings" onClick={() => onOpenSettings?.()} title="Settings" aria-label="Settings"><IconSettings /></button>
          </div>
        </div>
      </div>
      {userCtrlDropdown && userCtrlAnchor && createPortal(
        <>
          <div
            className="voice-member-popup-backdrop user-ctrl-backdrop"
            style={{ zIndex: 10999, pointerEvents: 'auto' }}
            aria-hidden
            onClick={() => { setUserCtrlDropdown(null); setUserCtrlAnchor(null); }}
          />
          <div
            className="user-ctrl-dropdown"
            style={{
              position: 'fixed',
              left: userCtrlAnchor.left,
              bottom: typeof window !== 'undefined' ? window.innerHeight - userCtrlAnchor.top + 8 : 0,
              zIndex: 11000,
              minWidth: 160,
              maxWidth: typeof window !== 'undefined' ? Math.min(280, window.innerWidth - userCtrlAnchor.left - 12) : 280,
            }}
          >
            <div className="user-ctrl-dropdown-inner">
              {userCtrlDropdown === 'mic' && (
                <div className="user-ctrl-dropdown-row" onMouseDown={(e) => e.stopPropagation()}>
                  <label>Microphone volume</label>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={settings ? Math.round(settings.micVolume * 100) : 100}
                    onChange={(e) => {
                      const v = Number((e.target as HTMLInputElement).value) / 100;
                      setMicVolume?.(Math.min(2, Math.max(0, v)));
                    }}
                  />
                </div>
              )}
              {userCtrlDropdown === 'headphone' && (
                <div className="user-ctrl-dropdown-row" onMouseDown={(e) => e.stopPropagation()}>
                  <label>Speaker volume</label>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={settings ? Math.round(settings.speakerVolume * 100) : 100}
                    onChange={(e) => {
                      const v = Number((e.target as HTMLInputElement).value) / 100;
                      setSpeakerVolume?.(Math.min(2, Math.max(0, v)));
                    }}
                  />
                </div>
              )}
              {userCtrlDropdown === 'screenshare' && (
                <div className="screenshare-popup" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="screenshare-popup-tabs">
                    <button type="button" className={`screenshare-tab ${screenShareTab === 'screens' ? 'active' : ''}`} onClick={() => setScreenShareTab('screens')}>Screens</button>
                    <button type="button" className={`screenshare-tab ${screenShareTab === 'windows' ? 'active' : ''}`} onClick={() => setScreenShareTab('windows')}>Windows</button>
                  </div>
                  {screenSharing && (
                    <button type="button" className="user-ctrl-dropdown-item" onClick={() => { setUserCtrlDropdown(null); setUserCtrlAnchor(null); onStopScreenShare?.(); }}>
                      Stop sharing
                    </button>
                  )}
                  <div className="user-ctrl-dropdown-row">
                    <label>Resolution</label>
                    <select value={screenShareResolution} onChange={(e) => setScreenShareResolution(e.target.value as '720p' | '1080p' | 'source')} className="user-ctrl-select">
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="source">Source</option>
                    </select>
                  </div>
                  <div className="user-ctrl-dropdown-row">
                    <label>Frame rate</label>
                    <select value={screenShareFps} onChange={(e) => setScreenShareFps(e.target.value === 'source' ? 'source' : Number(e.target.value) as 30 | 60)} className="user-ctrl-select">
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                      <option value="source">Source (native)</option>
                    </select>
                  </div>
                  <div className="user-ctrl-dropdown-row">
                    <label>Bitrate</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(() => {
                        const PRESET_SET = new Set([1_500_000, 2_000_000, 3_000_000, 4_000_000, 6_000_000, 10_000_000]);
                        const isCustom = !PRESET_SET.has(screenShareBitrate);
                        const customDisplay = isCustom ? String(screenShareBitrate / 1_000_000) : '';
                        return (
                          <>
                            <select
                              value={isCustom ? 'custom' : String(screenShareBitrate)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'custom') {
                                  setScreenShareBitrateCustom(String(screenShareBitrate / 1_000_000));
                                } else {
                                  setScreenShareBitrateCustom('');
                                  setScreenShareBitrate(Number(v));
                                }
                              }}
                              className="user-ctrl-select"
                              style={{ flex: '1 1 120px', minWidth: 0 }}
                            >
                              <option value={1500000}>1.5 Mbps</option>
                              <option value={2000000}>2 Mbps</option>
                              <option value={3000000}>3 Mbps</option>
                              <option value={4000000}>4 Mbps</option>
                              <option value={6000000}>6 Mbps</option>
                              <option value={10000000}>10 Mbps</option>
                              <option value="custom">Custom…</option>
                            </select>
                            {(isCustom || screenShareBitrateCustom !== '') && (
                              <>
                                <input
                                  type="number"
                                  min={0.5}
                                  max={50}
                                  step={0.5}
                                  value={screenShareBitrateCustom !== '' ? screenShareBitrateCustom : customDisplay}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setScreenShareBitrateCustom(val);
                                    const n = Number(val);
                                    if (Number.isFinite(n) && n >= 0.5 && n <= 50) {
                                      setScreenShareBitrate(Math.round(n * 1_000_000));
                                    }
                                  }}
                                  className="user-ctrl-select"
                                  style={{ width: 70 }}
                                  placeholder="Mbps"
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mbps</span>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="user-ctrl-dropdown-item"
                    onClick={async () => {
                      if (shareInProgressRef.current) return;
                      shareInProgressRef.current = true;
                      setUserCtrlDropdown(null);
                      setUserCtrlAnchor(null);
                      setScreenShareToast('Select your screen or window to share…');
                      try {
                        if (!navigator.mediaDevices?.getDisplayMedia) {
                          setScreenShareToast('Screen share requires a secure connection. Use https:// or http://localhost');
                          setTimeout(() => setScreenShareToast(null), 5000);
                          return;
                        }
                        let stream: MediaStream | null = null;
                        try {
                          stream = await navigator.mediaDevices.getDisplayMedia({
                            video: true,
                            audio: false,
                          });
                        } catch (gdmErr) {
                          const requestScreenShare = typeof window !== 'undefined' && (window as { bahuckel?: { requestScreenShare?: () => Promise<string | null> } }).bahuckel?.requestScreenShare;
                          const sourceId = requestScreenShare ? await requestScreenShare() : null;
                          if (sourceId) {
                            stream = await navigator.mediaDevices.getUserMedia({
                              audio: false,
                              video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } as MediaTrackConstraints,
                            });
                          } else {
                            throw gdmErr;
                          }
                        }
                        setScreenShareToast(null);
                        const videoTrack = stream.getVideoTracks()[0];
                        if (!videoTrack) {
                          stream.getTracks().forEach((t) => t.stop());
                          setScreenShareToast('No video track in stream.');
                          setTimeout(() => setScreenShareToast(null), 3000);
                          return;
                        }
                        videoTrack.enabled = true;
                        videoTrack.addEventListener('ended', () => onStopScreenShare?.());
                        onStartScreenShare?.(stream, screenShareTab === 'screens' ? 'screen' : 'window', { bitrate: screenShareBitrate });
                      } catch (err) {
                        setScreenShareToast('Screen share failed. Please try again.');
                        setTimeout(() => setScreenShareToast(null), 4000);
                        devWarn('Screen share failed:', err);
                      } finally {
                        shareInProgressRef.current = false;
                      }
                    }}
                  >
                    Share {screenShareTab === 'screens' ? 'screen' : 'window'}
                  </button>
                  <button
                    type="button"
                    className="user-ctrl-dropdown-item"
                    onClick={async () => {
                      setUserCtrlDropdown(null);
                      setUserCtrlAnchor(null);
                      try {
                        const constraints = screenShareResolution === '720p'
                          ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }
                          : screenShareResolution === '1080p'
                            ? { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } }
                            : { video: true };
                        const stream = await navigator.mediaDevices.getUserMedia(constraints);
                        onStartScreenShare?.(stream, 'camera');
                      } catch (err) {
                        devWarn('Camera share failed:', err);
                        setScreenShareToast('Camera share failed. Please check permissions.');
                        setTimeout(() => setScreenShareToast(null), 4000);
                      }
                    }}
                  >
                    Share camera
                  </button>
                </div>
              )}
            </div>
          </div>
        </>,
        document.getElementById('portal-root') || document.body
      )}
    </>
  );
}
