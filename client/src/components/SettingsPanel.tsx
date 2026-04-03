import { useState, useEffect, useRef, useCallback } from 'react';
import { sha256HexUtf8 } from '../utils/passwordTransport';
import { useSettings } from '../context/SettingsContext';
import { CHAT_FONT_SIZE_MIN, CHAT_FONT_SIZE_MAX, THEMES, UI_FONT_OPTIONS, VOICE_SOUND_PRESETS, type ThemeId, type VoiceSoundId, type TimeFormatId, type UiFontId } from '../constants';

function hueToHex(hue: number): string {
  const h = (hue % 360) / 360;
  const s: number = 1; const l = 0.5;
  let r: number; let g: number; let b: number;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return Math.round(h * 360);
}
import { playVoiceJoinSound, playVoiceLeaveSound } from '../utils/sound';
import { downloadWebRtcDiagnosticsSnapshot } from '../utils/webrtcDiagnostics';
import { downloadVoiceSessionLog } from '../utils/voiceSessionLog';
import { Avatar } from './Avatar';

const AVATAR_CIRCLE_SIZE = 200;
const AVATAR_ZOOM_MIN = 0.5;
const AVATAR_ZOOM_MAX = 3;

interface ResetRequest {
  id: string;
  username: string;
  requestedAt: string;
  status: 'approved' | 'failed';
  answerMatch: boolean;
}

interface JoinRequest {
  id: string;
  serverId: string;
  serverName: string;
  username: string;
  requestedAt: string;
}

interface ServerInfo {
  id: string;
  name: string;
  ownerId?: string;
  members?: string[];
  kicked?: string[];
}

type SettingsTab = 'user' | 'sounds' | 'profile' | 'admin';

const MAX_ABOUT_LEN = 500;

interface SettingsPanelProps {
  onClose: () => void;
  onLogout?: () => void;
  send: (msg: Record<string, unknown>) => void;
  subscribe: (listener: (msg: Record<string, unknown>) => void) => () => void;
  isAdmin?: boolean;
  isGlobalOwner?: boolean;
  hasDebugPermission?: boolean;
  servers?: ServerInfo[];
  currentUsername?: string;
  avatarCacheBust?: number;
  onAvatarUpdate?: () => void;
}

const MAX_AVATAR_PIXELS = 512;

/** If dataUrl is over maxBytes, downsize via canvas (resize + JPEG) to fit. Returns dataUrl under limit or original. */
function resizeAvatarIfNeeded(dataUrl: string, maxBytes: number): Promise<string | null> {
  if (!dataUrl.startsWith('data:image/')) return Promise.resolve(null);
  if (dataUrl.length <= maxBytes) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_AVATAR_PIXELS || h > MAX_AVATAR_PIXELS) {
        if (w > h) {
          h = Math.round((h * MAX_AVATAR_PIXELS) / w);
          w = MAX_AVATAR_PIXELS;
        } else {
          w = Math.round((w * MAX_AVATAR_PIXELS) / h);
          h = MAX_AVATAR_PIXELS;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      for (let q = 0.9; q >= 0.1; q -= 0.1) {
        const jpeg = canvas.toDataURL('image/jpeg', q);
        if (jpeg.length <= maxBytes) {
          resolve(jpeg);
          return;
        }
      }
      resolve(canvas.toDataURL('image/jpeg', 0.1));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

declare global {
  interface Window {
    bahuckel?: { exitToServerSelect?: () => void };
  }
}

export function SettingsPanel({
  onClose,
  onLogout,
  send,
  subscribe,
  isAdmin = false,
  isGlobalOwner = false,
  hasDebugPermission = false,
  servers = [],
  currentUsername = '',
  avatarCacheBust,
  onAvatarUpdate,
}: SettingsPanelProps) {
  const { settings, setMicVolume, setSpeakerVolume, setNameColor, setChatFontSize, setAvatar, setTheme, setThemeHue, setChatBackground, setTaskRecorderEnabled, setWebRtcDiagnosticsEnabled, setVoiceSessionTraceEnabled, setVoiceJoinSound, setVoiceLeaveSound, setVoiceJoinSoundUrl, setVoiceLeaveSoundUrl, setMicSensitivity, setTimeFormat, setNeonEnabled, setNeonColor, setUiFont } = useSettings();
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [activeSection, setActiveSection] = useState<SettingsTab>('user');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarViewportRef = useRef<HTMLDivElement>(null);

  const [avatarEditorImage, setAvatarEditorImage] = useState<string | null>(null);
  const [draftVoiceJoin, setDraftVoiceJoin] = useState<VoiceSoundId | null>(null);
  const [draftVoiceLeave, setDraftVoiceLeave] = useState<VoiceSoundId | null>(null);
  const [draftVoiceJoinUrl, setDraftVoiceJoinUrl] = useState<string>('');
  const [draftVoiceLeaveUrl, setDraftVoiceLeaveUrl] = useState<string>('');
  const [avatarEditorSize, setAvatarEditorSize] = useState<{ w: number; h: number } | null>(null);
  const [avatarEditorPos, setAvatarEditorPos] = useState({ x: 0, y: 0 });
  const [avatarEditorZoom, setAvatarEditorZoom] = useState(1);
  const [micVolumePending, setMicVolumePending] = useState<number | null>(null);
  const [micSensitivityPending, setMicSensitivityPending] = useState<number | null>(null);
  const [speakerVolumePending, setSpeakerVolumePending] = useState<number | null>(null);
  const [avatarDrag, setAvatarDrag] = useState<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const avatarScaleToFitRef = useRef(1);
  const [webrtcDumpBusy, setWebrtcDumpBusy] = useState(false);
  const [aboutMeDraft, setAboutMeDraft] = useState('');
  const [aboutMeSaveStatus, setAboutMeSaveStatus] = useState<'idle' | 'saved'>('idle');

  const THEME_APPLY_DEBOUNCE_MS = 500;
  const themeHueDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neonColorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameColorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [themeHueDraft, setThemeHueDraft] = useState(settings.themeHue);
  const [neonColorDraft, setNeonColorDraft] = useState(settings.neonColor);
  const [nameColorDraft, setNameColorDraft] = useState(settings.nameColor);
  const [changePwAnswer, setChangePwAnswer] = useState('');
  const [changePwNew, setChangePwNew] = useState('');
  const [changePwConfirm, setChangePwConfirm] = useState('');
  const [changePwError, setChangePwError] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);

  useEffect(() => {
    setThemeHueDraft(settings.themeHue);
  }, [settings.themeHue]);
  useEffect(() => {
    setNeonColorDraft(settings.neonColor);
  }, [settings.neonColor]);
  useEffect(() => {
    setNameColorDraft(settings.nameColor);
  }, [settings.nameColor]);

  useEffect(() => {
    return () => {
      if (themeHueDebounceRef.current) clearTimeout(themeHueDebounceRef.current);
      if (neonColorDebounceRef.current) clearTimeout(neonColorDebounceRef.current);
      if (nameColorDebounceRef.current) clearTimeout(nameColorDebounceRef.current);
    };
  }, []);

  const scheduleThemeHueCommit = useCallback(
    (val: number) => {
      const v = Math.max(0, Math.min(360, val));
      setThemeHueDraft(v);
      if (themeHueDebounceRef.current) clearTimeout(themeHueDebounceRef.current);
      themeHueDebounceRef.current = setTimeout(() => {
        themeHueDebounceRef.current = null;
        setThemeHue(v);
      }, THEME_APPLY_DEBOUNCE_MS);
    },
    [setThemeHue],
  );

  const scheduleNeonColorCommit = useCallback(
    (hex: string) => {
      setNeonColorDraft(hex);
      if (neonColorDebounceRef.current) clearTimeout(neonColorDebounceRef.current);
      neonColorDebounceRef.current = setTimeout(() => {
        neonColorDebounceRef.current = null;
        setNeonColor(hex);
      }, THEME_APPLY_DEBOUNCE_MS);
    },
    [setNeonColor],
  );

  const scheduleNameColorCommit = useCallback(
    (hex: string) => {
      setNameColorDraft(hex);
      if (nameColorDebounceRef.current) clearTimeout(nameColorDebounceRef.current);
      nameColorDebounceRef.current = setTimeout(() => {
        nameColorDebounceRef.current = null;
        setNameColor(hex);
        send({ type: 'set_my_name_color', color: hex });
      }, THEME_APPLY_DEBOUNCE_MS);
    },
    [setNameColor, send],
  );

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'password_changed' && msg.source === 'change_password') {
        setChangePwLoading(false);
        setChangePwAnswer('');
        setChangePwNew('');
        setChangePwConfirm('');
        setChangePwError('');
      }
      if (msg.type === 'change_password_failed' && typeof msg.message === 'string') {
        setChangePwLoading(false);
        setChangePwError(msg.message);
      }
    });
  }, [subscribe]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwError('');
    const MIN_PW = 8;
    if (!changePwAnswer.trim()) {
      setChangePwError('Enter your security answer');
      return;
    }
    if (!changePwNew || changePwNew.length < MIN_PW) {
      setChangePwError(`New password must be at least ${MIN_PW} characters`);
      return;
    }
    if (!/[a-zA-Z]/.test(changePwNew) || !/\d/.test(changePwNew)) {
      setChangePwError('New password must contain at least one letter and one number');
      return;
    }
    if (changePwNew !== changePwConfirm) {
      setChangePwError('New passwords do not match');
      return;
    }
    setChangePwLoading(true);
    const newPasswordSha256 = await sha256HexUtf8(changePwNew);
    send({ type: 'change_password', securityAnswer: changePwAnswer.trim(), newPasswordSha256 });
  };

  const handleWebRtcSnapshotDownload = useCallback(async () => {
    setWebrtcDumpBusy(true);
    try {
      await downloadWebRtcDiagnosticsSnapshot();
    } catch (e) {
      console.error(e);
    } finally {
      setWebrtcDumpBusy(false);
    }
  }, []);

  const handleVoiceSessionLogDownload = useCallback(() => {
    downloadVoiceSessionLog();
  }, []);

  const handleAvatarFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scaleToFit = Math.min(AVATAR_CIRCLE_SIZE / w, AVATAR_CIRCLE_SIZE / h);
        avatarScaleToFitRef.current = scaleToFit;
        setAvatarEditorSize({ w, h });
        setAvatarEditorImage(dataUrl);
        setAvatarEditorPos({ x: 0, y: 0 });
        setAvatarEditorZoom(1);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const applyAvatarCrop = useCallback(() => {
    if (!avatarEditorImage || !avatarEditorSize) return;
    const img = new Image();
    img.src = avatarEditorImage;
    img.onload = () => {
      const D = AVATAR_CIRCLE_SIZE;
      const scale = avatarScaleToFitRef.current * avatarEditorZoom;
      const canvas = document.createElement('canvas');
      canvas.width = D;
      canvas.height = D;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.translate(D / 2 + avatarEditorPos.x, D / 2 + avatarEditorPos.y);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -avatarEditorSize.w / 2, -avatarEditorSize.h / 2, avatarEditorSize.w, avatarEditorSize.h);
      ctx.restore();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(D / 2, D / 2, D / 2, 0, 2 * Math.PI);
      ctx.fill();
      let dataUrl = canvas.toDataURL('image/png');
      resizeAvatarIfNeeded(dataUrl, 1024 * 1024).then((final) => {
        if (final) {
          setAvatar(final);
          send({ type: 'set_my_avatar', dataUrl: final });
          onAvatarUpdate?.(); // Immediate cache bust so avatar updates everywhere without waiting for broadcast
          setAvatarEditorImage(null);
          setAvatarEditorSize(null);
        }
      });
    };
  }, [avatarEditorImage, avatarEditorSize, avatarEditorPos, avatarEditorZoom, setAvatar, send, onAvatarUpdate]);

  const onAvatarWheel = useCallback((e: React.WheelEvent) => {
    if (!avatarEditorImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setAvatarEditorZoom((z) => Math.max(AVATAR_ZOOM_MIN, Math.min(AVATAR_ZOOM_MAX, z + delta)));
  }, [avatarEditorImage]);

  const loadResetRequests = () => send({ type: 'get_reset_requests' });
  const loadJoinRequests = () => send({ type: 'get_join_requests' });
  const loadAll = () => {
    if (isGlobalOwner) loadResetRequests();
    loadJoinRequests();
  };

  useEffect(() => {
    const commitPending = () => {
      if (micVolumePending !== null) {
        setMicVolume(micVolumePending);
        setMicVolumePending(null);
      }
      if (micSensitivityPending !== null) {
        setMicSensitivity(micSensitivityPending);
        setMicSensitivityPending(null);
      }
      if (speakerVolumePending !== null) {
        setSpeakerVolume(speakerVolumePending);
        setSpeakerVolumePending(null);
      }
    };
    if (micVolumePending !== null || micSensitivityPending !== null || speakerVolumePending !== null) {
      window.addEventListener('mouseup', commitPending);
      window.addEventListener('touchend', commitPending);
      return () => {
        window.removeEventListener('mouseup', commitPending);
        window.removeEventListener('touchend', commitPending);
      };
    }
  }, [micVolumePending, micSensitivityPending, speakerVolumePending, setMicVolume, setMicSensitivity, setSpeakerVolume]);

  useEffect(() => {
    return subscribe((msg: Record<string, unknown>) => {
      if (msg.type === 'user_profile') {
        const u = typeof msg.username === 'string' ? msg.username : '';
        if (!currentUsername || u.toLowerCase() !== currentUsername.toLowerCase()) return;
        if (msg.error === 'not_found') return;
        setAboutMeDraft(typeof msg.aboutMe === 'string' ? msg.aboutMe : '');
      }
      if (msg.type === 'my_about_saved' && msg.ok) {
        setAboutMeSaveStatus('saved');
        setTimeout(() => setAboutMeSaveStatus('idle'), 2000);
      }
    });
  }, [subscribe, currentUsername]);

  useEffect(() => {
    if (activeSection !== 'profile' || !currentUsername) return;
    setAboutMeSaveStatus('idle');
    send({ type: 'get_user_profile', username: currentUsername });
  }, [activeSection, currentUsername, send]);

  useEffect(() => {
    if (isAdmin) loadAll();
    return subscribe((msg: Record<string, unknown>) => {
      if (msg.type === 'reset_requests' && Array.isArray(msg.requests)) {
        setRequests(msg.requests as ResetRequest[]);
      }
      if (msg.type === 'join_requests' && Array.isArray(msg.requests)) {
        setJoinRequests(msg.requests as JoinRequest[]);
      }
      if (msg.type === 'join_request_processed') {
        loadJoinRequests();
      }
    });
  }, [subscribe, isAdmin, isGlobalOwner, send]);

  return (
    <div className="settings-panel-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2 className="settings-panel-title">Settings</h2>
          <button type="button" className="settings-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="settings-panel-tabs">
          <button type="button" className={activeSection === 'user' ? 'active' : ''} onClick={() => setActiveSection('user')}>User</button>
          <button type="button" className={activeSection === 'sounds' ? 'active' : ''} onClick={() => setActiveSection('sounds')}>Sounds</button>
          <button
            type="button"
            className={activeSection === 'profile' ? 'active' : ''}
            onClick={() => setActiveSection('profile')}
            title="About me and profile picture"
          >
            Profile
          </button>
          {isAdmin && (
            <button type="button" className={activeSection === 'admin' ? 'active' : ''} onClick={() => { setActiveSection('admin'); loadAll(); }}>Admin</button>
          )}
        </div>
        <div className="settings-panel-body">
          {activeSection === 'user' && (
            <div className="settings-section settings-section-centered">
              <label className="settings-row">
                <span className="settings-label">Microphone volume</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={Math.round((micVolumePending ?? settings.micVolume) * 100)}
                  onChange={(e) => setMicVolumePending(Number(e.target.value) / 100)}
                  onMouseUp={() => { if (micVolumePending !== null) { setMicVolume(micVolumePending); setMicVolumePending(null); } }}
                  onTouchEnd={() => { if (micVolumePending !== null) { setMicVolume(micVolumePending); setMicVolumePending(null); } }}
                />
                <span className="settings-value">{Math.round((micVolumePending ?? settings.micVolume) * 100)}%</span>
              </label>
              <label className="settings-row">
                <span className="settings-label">Microphone sensitivity (dB)</span>
                <input
                  type="range"
                  min="-100"
                  max="0"
                  value={micSensitivityPending ?? (settings.micSensitivity ?? -50)}
                  onChange={(e) => setMicSensitivityPending(Number(e.target.value))}
                  onMouseUp={() => { if (micSensitivityPending !== null) { setMicSensitivity(micSensitivityPending); setMicSensitivityPending(null); } }}
                  onTouchEnd={() => { if (micSensitivityPending !== null) { setMicSensitivity(micSensitivityPending); setMicSensitivityPending(null); } }}
                />
                <span className="settings-value">{(micSensitivityPending ?? settings.micSensitivity ?? -50)} dB</span>
              </label>
              <p className="settings-hint">Only transmit when input is above this level. -100 dB = always on, 0 dB = very loud only.</p>
              <label className="settings-row">
                <span className="settings-label">Speaker volume</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={Math.round((speakerVolumePending ?? settings.speakerVolume) * 100)}
                  onChange={(e) => setSpeakerVolumePending(Number(e.target.value) / 100)}
                  onMouseUp={() => { if (speakerVolumePending !== null) { setSpeakerVolume(speakerVolumePending); setSpeakerVolumePending(null); } }}
                  onTouchEnd={() => { if (speakerVolumePending !== null) { setSpeakerVolume(speakerVolumePending); setSpeakerVolumePending(null); } }}
                />
                <span className="settings-value">{Math.round((speakerVolumePending ?? settings.speakerVolume) * 100)}%</span>
              </label>
              <label className="settings-row">
                <span className="settings-label">Your name color</span>
                <input
                  type="color"
                  value={nameColorDraft}
                  onChange={(e) => scheduleNameColorCommit(e.target.value)}
                  className="settings-color-input"
                />
                <input
                  type="text"
                  value={nameColorDraft}
                  onChange={(e) => scheduleNameColorCommit(e.target.value)}
                  className="settings-color-text"
                  maxLength={7}
                />
              </label>
              <label className="settings-row">
                <span className="settings-label">Chat font size (px)</span>
                <div className="settings-font-size-row">
                  <input
                    type="number"
                    min={CHAT_FONT_SIZE_MIN}
                    max={CHAT_FONT_SIZE_MAX}
                    value={settings.chatFontSize}
                    onChange={(e) => setChatFontSize(Math.max(CHAT_FONT_SIZE_MIN, Math.min(CHAT_FONT_SIZE_MAX, Number(e.target.value) || CHAT_FONT_SIZE_MIN)))}
                    className="settings-font-size-input"
                  />
                  <input
                    type="range"
                    min={CHAT_FONT_SIZE_MIN}
                    max={CHAT_FONT_SIZE_MAX}
                    value={settings.chatFontSize}
                    onChange={(e) => setChatFontSize(Number(e.target.value))}
                    className="settings-font-size-slider"
                  />
                </div>
              </label>
              <label className="settings-row">
                <span className="settings-label">Interface font</span>
                <select
                  value={settings.uiFont}
                  onChange={(e) => setUiFont(e.target.value as UiFontId)}
                  className="settings-select"
                >
                  {UI_FONT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id} style={{ fontFamily: o.stack }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-hint">Uses fonts your system provides when installed; otherwise the browser picks a similar fallback.</p>
              <label className="settings-row">
                <span className="settings-label">Time format</span>
                <select
                  value={settings.timeFormat ?? '24'}
                  onChange={(e) => setTimeFormat((e.target.value as TimeFormatId) || '24')}
                  className="settings-select"
                >
                  <option value="24">24-hour</option>
                  <option value="12">12-hour</option>
                </select>
              </label>
              <label className="settings-row">
                <span className="settings-label">Theme</span>
                <div className="settings-theme-row">
                  <select
                    value={settings.theme}
                    onChange={(e) => {
                      const v = e.target.value as ThemeId;
                      setTheme(v === 'custom' || v in THEMES ? v : 'dark');
                    }}
                    className="settings-select"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="blue">Blue</option>
                    <option value="midnight">Midnight</option>
                    <option value="custom">Custom (color wheel)</option>
                  </select>
                  {settings.theme === 'custom' && (
                    <div className="settings-theme-color-wrap">
                      <input
                        type="color"
                        className="settings-theme-color"
                        value={hueToHex(themeHueDraft)}
                        onChange={(e) => {
                          const hue = hexToHue(e.target.value);
                          scheduleThemeHueCommit(hue);
                        }}
                        aria-label="Theme color"
                      />
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={themeHueDraft}
                        onChange={(e) => scheduleThemeHueCommit(Number(e.target.value))}
                        className="settings-theme-hue-slider"
                        aria-label="Theme hue"
                      />
                    </div>
                  )}
                </div>
              </label>
              <div className="settings-row">
                <span className="settings-label">Neon lighting</span>
                <div className="settings-theme-row">
                  <div className="settings-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={settings.neonEnabled}
                      onChange={(e) => setNeonEnabled(e.target.checked)}
                      id="settings-neon-enabled"
                    />
                    <label htmlFor="settings-neon-enabled" className="settings-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
                      Enable (separate from theme)
                    </label>
                  </div>
                  {settings.neonEnabled && (
                    <div className="settings-theme-color-wrap">
                      <input
                        type="color"
                        className="settings-theme-color"
                        value={neonColorDraft}
                        onChange={(e) => scheduleNeonColorCommit(e.target.value)}
                        aria-label="Neon light color"
                      />
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={hexToHue(neonColorDraft)}
                        onChange={(e) => scheduleNeonColorCommit(hueToHex(Number(e.target.value)))}
                        className="settings-theme-hue-slider"
                        aria-label="Neon hue"
                      />
                    </div>
                  )}
                </div>
              </div>
              {settings.neonEnabled && (
                <p className="settings-hint">Primary buttons use this color with a glow. Secondary controls use a thin outline and light up on hover. With chat bubbles (dark), your messages look different from others.</p>
              )}
              <p className="settings-hint">Chat background (bubbles or custom image) is set per server via the ⋮ menu next to the server name.</p>
              {currentUsername && (
                <form className="settings-change-password" onSubmit={handleChangePassword}>
                  <p className="settings-label" style={{ marginTop: 12, marginBottom: 4 }}>Change password</p>
                  <p className="settings-hint">Requires your security answer (same one used for &quot;Forgot password&quot;).</p>
                  <label className="settings-row">
                    <span className="settings-label">Security answer</span>
                    <input
                      type="password"
                      className="settings-color-text"
                      style={{ maxWidth: '100%' }}
                      value={changePwAnswer}
                      onChange={(e) => setChangePwAnswer(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label className="settings-row">
                    <span className="settings-label">New password</span>
                    <input
                      type="password"
                      className="settings-color-text"
                      style={{ maxWidth: '100%' }}
                      value={changePwNew}
                      onChange={(e) => setChangePwNew(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="settings-row">
                    <span className="settings-label">Confirm new password</span>
                    <input
                      type="password"
                      className="settings-color-text"
                      style={{ maxWidth: '100%' }}
                      value={changePwConfirm}
                      onChange={(e) => setChangePwConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                  {changePwError && <p className="username-modal-error" role="alert">{changePwError}</p>}
                  <button type="submit" className="username-modal-submit" disabled={changePwLoading} style={{ marginTop: 8 }}>
                    {changePwLoading ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              )}
              <div className="settings-row settings-account-actions">
                {onLogout && (
                  <button type="button" className="settings-logout-btn" onClick={onLogout}>Log out</button>
                )}
                {typeof window !== 'undefined' && typeof window.bahuckel?.exitToServerSelect === 'function' && (
                  <button type="button" className="settings-exit-server-btn" onClick={() => { window.bahuckel?.exitToServerSelect?.(); onClose(); }}>
                    Exit to Select a Server
                  </button>
                )}
              </div>
            </div>
          )}
          {activeSection === 'sounds' && (
            <div className="settings-section settings-section-centered">
              <div className="settings-sound-section">
                <div className="settings-row">
                  <span className="settings-label">Voice channel join sound</span>
                  <div className="settings-sound-row">
                    <select
                      value={draftVoiceJoin ?? settings.voiceJoinSound ?? 'chime'}
                      onChange={(e) => setDraftVoiceJoin((e.target.value as VoiceSoundId) || 'chime')}
                      className="settings-select"
                    >
                      {VOICE_SOUND_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                      <option value="custom">Custom (upload below)</option>
                    </select>
                    <input
                      type="file"
                      accept="audio/*"
                      className="settings-sound-file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const url = reader.result as string;
                          setDraftVoiceJoinUrl(url);
                          setDraftVoiceJoin('custom');
                        };
                        reader.readAsDataURL(f);
                        e.target.value = '';
                      }}
                      aria-label="Upload join sound"
                    />
                    <button type="button" className="settings-sound-preview" onClick={() => playVoiceJoinSound(draftVoiceJoin ?? settings.voiceJoinSound, draftVoiceJoinUrl || settings.voiceJoinSoundUrl)}>Preview</button>
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Voice channel leave sound</span>
                  <div className="settings-sound-row">
                    <select
                      value={draftVoiceLeave ?? settings.voiceLeaveSound ?? 'pop'}
                      onChange={(e) => setDraftVoiceLeave((e.target.value as VoiceSoundId) || 'pop')}
                      className="settings-select"
                    >
                      {VOICE_SOUND_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                      <option value="custom">Custom (upload below)</option>
                    </select>
                    <input
                      type="file"
                      accept="audio/*"
                      className="settings-sound-file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const url = reader.result as string;
                          setDraftVoiceLeaveUrl(url);
                          setDraftVoiceLeave('custom');
                        };
                        reader.readAsDataURL(f);
                        e.target.value = '';
                      }}
                      aria-label="Upload leave sound"
                    />
                    <button type="button" className="settings-sound-preview" onClick={() => playVoiceLeaveSound(draftVoiceLeave ?? settings.voiceLeaveSound, draftVoiceLeaveUrl || settings.voiceLeaveSoundUrl)}>Preview</button>
                  </div>
                </div>
                <div className="settings-sound-ok-row">
                  <button
                    type="button"
                    className="settings-sound-ok-btn"
                    onClick={() => {
                      setVoiceJoinSound(draftVoiceJoin ?? settings.voiceJoinSound ?? 'chime');
                      setVoiceLeaveSound(draftVoiceLeave ?? settings.voiceLeaveSound ?? 'pop');
                      setVoiceJoinSoundUrl(draftVoiceJoinUrl || settings.voiceJoinSoundUrl);
                      setVoiceLeaveSoundUrl(draftVoiceLeaveUrl || settings.voiceLeaveSoundUrl);
                      setDraftVoiceJoin(null);
                      setDraftVoiceLeave(null);
                      setDraftVoiceJoinUrl('');
                      setDraftVoiceLeaveUrl('');
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeSection === 'profile' && (
            <div className="settings-section settings-section-centered">
              <h3 className="settings-profile-heading">Profile</h3>
              <p className="settings-profile-intro">Edit your about text and profile picture.</p>
              <div className="settings-row settings-about-row">
                <span className="settings-label">About me</span>
                <textarea
                  className="settings-about-textarea"
                  value={aboutMeDraft}
                  onChange={(e) => setAboutMeDraft(e.target.value.slice(0, MAX_ABOUT_LEN))}
                  placeholder="Tell others a bit about yourself…"
                  rows={4}
                  maxLength={MAX_ABOUT_LEN}
                  aria-label="About me"
                />
                <div className="settings-about-footer">
                  <span className="settings-about-count">
                    {aboutMeDraft.length}/{MAX_ABOUT_LEN}
                  </span>
                  <div className="settings-about-actions">
                    {aboutMeSaveStatus === 'saved' && (
                      <span className="settings-about-saved" role="status">
                        Saved
                      </span>
                    )}
                    <button
                      type="button"
                      className="settings-avatar-btn settings-avatar-btn-primary"
                      onClick={() => {
                        send({ type: 'set_my_about', about: aboutMeDraft });
                      }}
                    >
                      Save about
                    </button>
                  </div>
                </div>
              </div>
              <div className="settings-row settings-avatar-editor-row">
                <span className="settings-label">Profile picture</span>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="settings-avatar-input"
                  aria-label="Choose image"
                  onChange={handleAvatarFileSelect}
                />
                <div className="settings-avatar-editor-wrap">
                  <div
                    ref={avatarViewportRef}
                    className={`settings-avatar-viewport ${!avatarEditorImage ? 'settings-avatar-viewport-empty' : ''}`}
                    style={{ width: AVATAR_CIRCLE_SIZE, height: AVATAR_CIRCLE_SIZE }}
                    onWheel={onAvatarWheel}
                    onMouseDown={(e) => {
                      if (!avatarEditorImage) {
                        avatarInputRef.current?.click();
                        return;
                      }
                      e.preventDefault();
                      setAvatarDrag({
                        startX: e.clientX,
                        startY: e.clientY,
                        startPosX: avatarEditorPos.x,
                        startPosY: avatarEditorPos.y,
                      });
                    }}
                    onMouseMove={(e) => {
                      if (!avatarDrag) return;
                      setAvatarEditorPos({
                        x: avatarDrag.startPosX + (e.clientX - avatarDrag.startX),
                        y: avatarDrag.startPosY + (e.clientY - avatarDrag.startY),
                      });
                    }}
                    onMouseUp={() => setAvatarDrag(null)}
                    onMouseLeave={() => setAvatarDrag(null)}
                    onClick={() => {
                      if (!avatarEditorImage) avatarInputRef.current?.click();
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !avatarEditorImage) avatarInputRef.current?.click();
                    }}
                    aria-label={avatarEditorImage ? 'Drag to position avatar' : 'Click to choose image'}
                  >
                    {avatarEditorImage && avatarEditorSize ? (
                      <div
                        className="settings-avatar-editor-image-wrap"
                        style={{
                          width: avatarEditorSize.w,
                          height: avatarEditorSize.h,
                          transform: `translate(${avatarEditorPos.x}px, ${avatarEditorPos.y}px) translate(-50%, -50%) scale(${avatarScaleToFitRef.current * avatarEditorZoom})`,
                        }}
                      >
                        <img src={avatarEditorImage} alt="" draggable={false} />
                      </div>
                    ) : (
                      <span className="settings-avatar-placeholder-text">Click to choose image</span>
                    )}
                  </div>
                  {avatarEditorImage && (
                    <>
                      <div className="settings-avatar-zoom-wrap">
                        <span className="settings-avatar-zoom-label">Zoom</span>
                        <input
                          type="range"
                          className="settings-avatar-zoom-slider"
                          min={0}
                          max={100}
                          value={((avatarEditorZoom - AVATAR_ZOOM_MIN) / (AVATAR_ZOOM_MAX - AVATAR_ZOOM_MIN)) * 100}
                          onChange={(e) => {
                            const t = Number(e.target.value) / 100;
                            setAvatarEditorZoom(AVATAR_ZOOM_MIN + t * (AVATAR_ZOOM_MAX - AVATAR_ZOOM_MIN));
                          }}
                          aria-label="Zoom"
                        />
                      </div>
                      <div className="settings-avatar-actions">
                        <button type="button" className="settings-avatar-btn settings-avatar-btn-primary" onClick={applyAvatarCrop}>
                          Use as avatar
                        </button>
                        <button
                          type="button"
                          className="settings-avatar-btn"
                          onClick={() => {
                            setAvatarEditorImage(null);
                            setAvatarEditorSize(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {!avatarEditorImage && currentUsername && (
                  <div className="settings-avatar-current-wrap">
                    <span className="settings-avatar-hint">Current avatar</span>
                    <div className="settings-avatar-current">
                      <Avatar
                        username={currentUsername}
                        cacheBust={avatarCacheBust}
                        imgClassName="settings-avatar-current-img"
                        initialClassName="settings-avatar-current-initial"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeSection === 'admin' && isAdmin && (
            <div className="settings-admin-section">
              {hasDebugPermission && (
                <label className="settings-row">
                  <span className="settings-label">Task recorder (debug)</span>
                  <input
                    type="checkbox"
                    checked={settings.taskRecorderEnabled ?? false}
                    onChange={(e) => setTaskRecorderEnabled(e.target.checked)}
                    aria-label="Enable task recorder for debugging"
                  />
                  <span className="settings-hint" style={{ marginLeft: 8 }}>
                    Logs clicks for debugging. Admins/owners only.
                  </span>
                </label>
              )}
              {hasDebugPermission && (
                <>
                  <label className="settings-row">
                    <span className="settings-label">WebRTC diagnostics (debug)</span>
                    <input
                      type="checkbox"
                      checked={settings.webrtcDiagnosticsEnabled ?? false}
                      onChange={(e) => setWebRtcDiagnosticsEnabled(e.target.checked)}
                      aria-label="Enable WebRTC snapshot export for debugging"
                    />
                    <span className="settings-hint" style={{ marginLeft: 8 }}>
                      Enables downloading a JSON snapshot of voice connections (similar to chrome://webrtc-internals).
                    </span>
                  </label>
                  {(settings.webrtcDiagnosticsEnabled ?? false) && (
                    <div className="settings-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="settings-avatar-btn settings-avatar-btn-primary"
                        onClick={() => void handleWebRtcSnapshotDownload()}
                        disabled={webrtcDumpBusy}
                      >
                        {webrtcDumpBusy ? 'Generating…' : 'Download WebRTC snapshot'}
                      </button>
                      <span className="settings-hint">Join a voice channel with someone else first; then export while the issue happens. The file includes peer stats and, if voice trace is on below, the same session log.</span>
                    </div>
                  )}
                  <label className="settings-row">
                    <span className="settings-label">Voice session trace (debug)</span>
                    <input
                      type="checkbox"
                      checked={settings.voiceSessionTraceEnabled ?? false}
                      onChange={(e) => setVoiceSessionTraceEnabled(e.target.checked)}
                      aria-label="Enable voice session trace"
                    />
                    <span className="settings-hint" style={{ marginLeft: 8 }}>
                      Records join/leave, member order, signaling (no SDP), and peer connection/ICE state. Turn on before reproducing blinks or soft disconnects.
                    </span>
                  </label>
                  {(settings.voiceSessionTraceEnabled ?? false) && (
                    <div className="settings-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="settings-avatar-btn settings-avatar-btn-primary"
                        onClick={handleVoiceSessionLogDownload}
                      >
                        Download voice session log
                      </button>
                      <span className="settings-hint">JSON timeline only; WebRTC snapshot also embeds this buffer.</span>
                    </div>
                  )}
                </>
              )}
              {isGlobalOwner && (
                <>
                  <h3 className="admin-panel-section-title">Password reset requests</h3>
                  <div className="admin-panel-list">
                    {requests.length === 0 ? (
                      <p className="admin-panel-empty">None</p>
                    ) : (
                      <table className="admin-panel-table">
                        <thead>
                          <tr><th>User</th><th>Time</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {requests.map((r) => (
                            <tr key={r.id}>
                              <td>{r.username}</td>
                              <td>{new Date(r.requestedAt).toLocaleString()}</td>
                              <td className={r.status === 'approved' ? 'admin-status-ok' : 'admin-status-fail'}>{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
              <h3 className="admin-panel-section-title">Join requests</h3>
              <button type="button" className="admin-panel-refresh" onClick={loadJoinRequests}>Refresh</button>
              <div className="admin-panel-list">
                {joinRequests.length === 0 ? (
                  <p className="admin-panel-empty">None</p>
                ) : (
                  <table className="admin-panel-table">
                    <thead>
                      <tr><th>Server</th><th>User</th><th>Time</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {joinRequests.map((r) => (
                        <tr key={r.id}>
                          <td>{r.serverName}</td>
                          <td>{r.username}</td>
                          <td>{new Date(r.requestedAt).toLocaleString()}</td>
                          <td className="admin-panel-actions">
                            <button type="button" className="admin-btn-accept" onClick={() => send({ type: 'accept_join_request', requestId: r.id })}>Accept</button>
                            <button type="button" className="admin-btn-decline" onClick={() => send({ type: 'decline_join_request', requestId: r.id })}>Decline</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <h3 className="admin-panel-section-title">Server members &amp; kick</h3>
              {servers.length === 0 ? (
                <p className="admin-panel-empty">You don&apos;t own any servers.</p>
              ) : (
                <div className="admin-panel-list">
                  {servers.map((server) => (
                    <div key={server.id} className="admin-server-block">
                      <h4 className="admin-server-name">{server.name}</h4>
                      <div className="admin-server-members">
                        <span className="admin-server-label">Members:</span>
                        {(server.members ?? []).length === 0 ? (
                          <span className="admin-panel-empty">None</span>
                        ) : (
                          <ul className="admin-member-list">
                            {(server.members ?? []).map((u) => (
                              <li key={u}>
                                {u}
                                {u !== currentUsername && (
                                  <button type="button" className="admin-btn-kick" onClick={() => send({ type: 'kick_member', serverId: server.id, username: u })}>Kick</button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="admin-server-kicked">
                        <span className="admin-server-label">Kicked:</span>
                        {(server.kicked ?? []).length === 0 ? (
                          <span className="admin-panel-empty">None</span>
                        ) : (
                          <ul className="admin-member-list">
                            {(server.kicked ?? []).map((u) => (
                              <li key={u}>
                                {u}
                                <button type="button" className="admin-btn-allow" onClick={() => send({ type: 'allow_back_member', serverId: server.id, username: u })}>Allow back</button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
