import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, CHAT_FONT_SIZE_MIN, CHAT_FONT_SIZE_MAX, THEMES, themeFromHue, SERVER_CHAT_BG_KEY, SERVER_CHAT_BG_IMG_KEY, SERVER_CHAT_BG_FIT_KEY, VOICE_SOUND_PRESETS, getUiFontStack, normalizeUiFontId, type ThemeId, type ChatBackgroundId, type BackgroundImageFit, type VoiceSoundId, type TimeFormatId, type UiFontId } from '../constants';
import { applyNeonCssVars, clearNeonCssVars, parseHex } from '../utils/neon';
import { setVoiceSessionTraceEnabled as applyVoiceSessionTraceToLogger } from '../utils/voiceSessionLog';

export type ServerChatBackground = { background: ChatBackgroundId; imageUrl: string; imageFit: BackgroundImageFit };

type Settings = {
  micVolume: number;
  speakerVolume: number;
  nameColor: string;
  chatFontSize: number;
  avatar: string;
  theme: ThemeId;
  themeHue: number;
  chatBackground: ChatBackgroundId;
  taskRecorderEnabled: boolean;
  webrtcDiagnosticsEnabled: boolean;
  voiceSessionTraceEnabled: boolean;
  voiceJoinSound: VoiceSoundId;
  voiceLeaveSound: VoiceSoundId;
  voiceJoinSoundUrl: string;
  voiceLeaveSoundUrl: string;
  micSensitivity: number;
  timeFormat: TimeFormatId;
  screenShareVolume: number;
  neonEnabled: boolean;
  neonColor: string;
  uiFont: UiFontId;
};

const loadSettings = (): Settings => {
  try {
    const mic = localStorage.getItem(SETTINGS_KEYS.MIC_VOLUME);
    const speaker = localStorage.getItem(SETTINGS_KEYS.SPEAKER_VOLUME);
    const color = localStorage.getItem(SETTINGS_KEYS.NAME_COLOR);
    const fontSize = localStorage.getItem(SETTINGS_KEYS.CHAT_FONT_SIZE);
    const sizeNum = fontSize != null ? Number(fontSize) : DEFAULT_SETTINGS.chatFontSize;
    const chatFontSize = Math.max(CHAT_FONT_SIZE_MIN, Math.min(CHAT_FONT_SIZE_MAX, sizeNum));
    const avatar = localStorage.getItem(SETTINGS_KEYS.AVATAR) || '';
    const theme = (localStorage.getItem(SETTINGS_KEYS.THEME) as ThemeId) || DEFAULT_SETTINGS.theme;
    const themeId = (theme === 'custom' ? 'custom' : (theme in THEMES ? theme : DEFAULT_SETTINGS.theme)) as ThemeId;
    const themeHueRaw = localStorage.getItem(SETTINGS_KEYS.THEME_HUE);
    const themeHue = themeHueRaw != null ? Math.max(0, Math.min(360, Number(themeHueRaw))) : 220;
    const chatBg = localStorage.getItem(SETTINGS_KEYS.CHAT_BACKGROUND) as ChatBackgroundId | null;
    const chatBackground = (chatBg === 'bubbles-dark' || chatBg === 'bubbles-light') ? chatBg : 'default';
    const taskRecorder = localStorage.getItem(SETTINGS_KEYS.TASK_RECORDER_ENABLED);
    const taskRecorderEnabled = taskRecorder === 'true';
    const webrtcDiag = localStorage.getItem(SETTINGS_KEYS.WEBRTC_DIAGNOSTICS_ENABLED);
    const webrtcDiagnosticsEnabled = webrtcDiag === 'true';
    const voiceTrace = localStorage.getItem(SETTINGS_KEYS.VOICE_SESSION_TRACE);
    const voiceSessionTraceEnabled = voiceTrace === 'true';
    const voiceJoin = localStorage.getItem(SETTINGS_KEYS.VOICE_JOIN_SOUND) as VoiceSoundId | null;
    const voiceLeave = localStorage.getItem(SETTINGS_KEYS.VOICE_LEAVE_SOUND) as VoiceSoundId | null;
    const voiceJoinUrl = localStorage.getItem(SETTINGS_KEYS.VOICE_JOIN_SOUND_URL) || '';
    const voiceLeaveUrl = localStorage.getItem(SETTINGS_KEYS.VOICE_LEAVE_SOUND_URL) || '';
    const voiceJoinSound = (voiceJoin && VOICE_SOUND_PRESETS.some((p) => p.id === voiceJoin)) || voiceJoin === 'custom' ? voiceJoin : DEFAULT_SETTINGS.voiceJoinSound;
    const voiceLeaveSound = (voiceLeave && VOICE_SOUND_PRESETS.some((p) => p.id === voiceLeave)) || voiceLeave === 'custom' ? voiceLeave : DEFAULT_SETTINGS.voiceLeaveSound;
    const micSens = localStorage.getItem(SETTINGS_KEYS.MIC_SENSITIVITY);
    const micSensitivity = micSens != null ? Math.max(-100, Math.min(0, Number(micSens))) : DEFAULT_SETTINGS.micSensitivity;
    const timeFmt = localStorage.getItem(SETTINGS_KEYS.TIME_FORMAT) as TimeFormatId | null;
    const timeFormat: TimeFormatId = (timeFmt === '12' || timeFmt === '24') ? timeFmt : '24';
    const screenShareVol = localStorage.getItem(SETTINGS_KEYS.SCREEN_SHARE_VOLUME);
    const screenShareVolume = screenShareVol != null ? Math.max(0, Math.min(2, Number(screenShareVol))) : DEFAULT_SETTINGS.screenShareVolume;
    const neonRaw = localStorage.getItem(SETTINGS_KEYS.NEON_ENABLED);
    const neonEnabled = neonRaw === 'false' ? false : true;
    const neonColorRaw = localStorage.getItem(SETTINGS_KEYS.NEON_COLOR);
    const neonColor =
      neonColorRaw && parseHex(neonColorRaw) ? neonColorRaw : DEFAULT_SETTINGS.neonColor;
    const uiFont = normalizeUiFontId(localStorage.getItem(SETTINGS_KEYS.UI_FONT));
    return {
      micVolume: mic != null ? Math.max(0, Math.min(2, Number(mic))) : DEFAULT_SETTINGS.micVolume,
      speakerVolume: speaker != null ? Math.max(0, Math.min(2, Number(speaker))) : DEFAULT_SETTINGS.speakerVolume,
      nameColor: color || DEFAULT_SETTINGS.nameColor,
      chatFontSize,
      avatar: avatar && avatar.startsWith('data:image/') ? avatar : '',
      theme: themeId as ThemeId,
      themeHue,
      chatBackground,
      taskRecorderEnabled,
      webrtcDiagnosticsEnabled,
      voiceSessionTraceEnabled,
      voiceJoinSound,
      voiceLeaveSound,
      voiceJoinSoundUrl: voiceJoinUrl && (voiceJoinUrl.startsWith('data:') || voiceJoinUrl.startsWith('blob:')) ? voiceJoinUrl : '',
      voiceLeaveSoundUrl: voiceLeaveUrl && (voiceLeaveUrl.startsWith('data:') || voiceLeaveUrl.startsWith('blob:')) ? voiceLeaveUrl : '',
      micSensitivity,
      timeFormat,
      screenShareVolume,
      neonEnabled,
      neonColor,
      uiFont,
    };
  } catch {
    return { ...DEFAULT_SETTINGS } as Settings;
  }
};

const SettingsContext = createContext<{
  settings: Settings;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  setNameColor: (c: string) => void;
  setChatFontSize: (v: number) => void;
  setAvatar: (v: string) => void;
  setTheme: (v: ThemeId) => void;
  setThemeHue: (v: number) => void;
  setChatBackground: (v: ChatBackgroundId) => void;
  setTaskRecorderEnabled: (v: boolean) => void;
  setWebRtcDiagnosticsEnabled: (v: boolean) => void;
  setVoiceSessionTraceEnabled: (v: boolean) => void;
  setVoiceJoinSound: (v: VoiceSoundId) => void;
  setVoiceLeaveSound: (v: VoiceSoundId) => void;
  setVoiceJoinSoundUrl: (v: string) => void;
  setVoiceLeaveSoundUrl: (v: string) => void;
  setMicSensitivity: (v: number) => void;
  setTimeFormat: (v: TimeFormatId) => void;
  setScreenShareVolume: (v: number) => void;
  setNeonEnabled: (v: boolean) => void;
  setNeonColor: (v: string) => void;
  setUiFont: (v: UiFontId) => void;
  serverChatBackgroundVersion: number;
  getServerChatBackground: (serverId: string | null) => ServerChatBackground;
  setServerChatBackground: (serverId: string | null, background: ChatBackgroundId, imageUrl?: string, imageFit?: BackgroundImageFit) => void;
} | null>(null);

const VALID_FITS: BackgroundImageFit[] = ['fill', 'fit', 'stretch', 'center', 'tile'];

function getServerChatBackgroundFromStorage(serverId: string | null): ServerChatBackground {
  if (!serverId) return { background: 'default', imageUrl: '', imageFit: 'fill' };
  try {
    const bg = localStorage.getItem(SERVER_CHAT_BG_KEY + serverId) as ChatBackgroundId | null;
    const imageUrl = localStorage.getItem(SERVER_CHAT_BG_IMG_KEY + serverId) || '';
    const fit = localStorage.getItem(SERVER_CHAT_BG_FIT_KEY + serverId) as BackgroundImageFit | null;
    const background = (bg === 'bubbles-dark' || bg === 'bubbles-light' || bg === 'custom') ? bg : 'default';
    const imageFit = fit && VALID_FITS.includes(fit) ? fit : 'fill';
    return { background, imageUrl: imageUrl && imageUrl.startsWith('data:image/') ? imageUrl : '', imageFit };
  } catch {
    return { background: 'default', imageUrl: '', imageFit: 'fill' };
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [serverChatBackgroundVersion, setServerChatBackgroundVersion] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    let vars: Record<string, string>;
    if (settings.theme === 'custom') {
      vars = themeFromHue(settings.themeHue, true);
    } else {
      vars = THEMES[settings.theme as keyof typeof THEMES];
    }
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.style.setProperty('--font-sans', getUiFontStack(settings.uiFont));

    if (settings.neonEnabled && parseHex(settings.neonColor)) {
      root.dataset.neon = 'on';
      applyNeonCssVars(root, settings.neonColor);
    } else {
      root.dataset.neon = 'off';
      clearNeonCssVars(root);
    }
  }, [settings.theme, settings.themeHue, settings.neonEnabled, settings.neonColor, settings.uiFont]);

  useEffect(() => {
    applyVoiceSessionTraceToLogger(settings.voiceSessionTraceEnabled);
  }, [settings.voiceSessionTraceEnabled]);

  const setMicVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(2, v));
    setSettings((s) => ({ ...s, micVolume: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.MIC_VOLUME, String(val));
    } catch {}
  }, []);

  const setSpeakerVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(2, v));
    setSettings((s) => ({ ...s, speakerVolume: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.SPEAKER_VOLUME, String(val));
    } catch {}
  }, []);

  const setNameColor = useCallback((c: string) => {
    setSettings((s) => ({ ...s, nameColor: c }));
    try {
      localStorage.setItem(SETTINGS_KEYS.NAME_COLOR, c);
    } catch {}
  }, []);

  const setChatFontSize = useCallback((v: number) => {
    const val = Math.max(CHAT_FONT_SIZE_MIN, Math.min(CHAT_FONT_SIZE_MAX, v));
    setSettings((s) => ({ ...s, chatFontSize: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.CHAT_FONT_SIZE, String(val));
    } catch {}
  }, []);

  const setAvatar = useCallback((v: string) => {
    const val = v && v.startsWith('data:image/') ? v : '';
    setSettings((s) => ({ ...s, avatar: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.AVATAR, val);
    } catch {}
  }, []);

  const setTheme = useCallback((v: ThemeId) => {
    if (v !== 'custom' && !THEMES[v as keyof typeof THEMES]) return;
    setSettings((s) => ({ ...s, theme: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.THEME, v);
    } catch {}
  }, []);

  const setThemeHue = useCallback((v: number) => {
    const val = Math.max(0, Math.min(360, v));
    setSettings((s) => ({ ...s, themeHue: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.THEME_HUE, String(val));
    } catch {}
  }, []);

  const setChatBackground = useCallback((v: ChatBackgroundId) => {
    if (v !== 'default' && v !== 'bubbles-dark' && v !== 'bubbles-light') return;
    setSettings((s) => ({ ...s, chatBackground: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.CHAT_BACKGROUND, v);
    } catch {}
  }, []);

  const setTaskRecorderEnabled = useCallback((v: boolean) => {
    setSettings((s) => ({ ...s, taskRecorderEnabled: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.TASK_RECORDER_ENABLED, v ? 'true' : 'false');
    } catch {}
  }, []);

  const setWebRtcDiagnosticsEnabled = useCallback((v: boolean) => {
    setSettings((s) => ({ ...s, webrtcDiagnosticsEnabled: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.WEBRTC_DIAGNOSTICS_ENABLED, v ? 'true' : 'false');
    } catch {}
  }, []);

  const setVoiceSessionTraceEnabled = useCallback((v: boolean) => {
    setSettings((s) => ({ ...s, voiceSessionTraceEnabled: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.VOICE_SESSION_TRACE, v ? 'true' : 'false');
    } catch {}
  }, []);

  const setVoiceJoinSound = useCallback((v: VoiceSoundId) => {
    setSettings((s) => ({ ...s, voiceJoinSound: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.VOICE_JOIN_SOUND, v);
    } catch {}
  }, []);

  const setVoiceLeaveSound = useCallback((v: VoiceSoundId) => {
    setSettings((s) => ({ ...s, voiceLeaveSound: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.VOICE_LEAVE_SOUND, v);
    } catch {}
  }, []);

  const setVoiceJoinSoundUrl = useCallback((v: string) => {
    setSettings((s) => ({ ...s, voiceJoinSoundUrl: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.VOICE_JOIN_SOUND_URL, v);
    } catch {}
  }, []);

  const setVoiceLeaveSoundUrl = useCallback((v: string) => {
    setSettings((s) => ({ ...s, voiceLeaveSoundUrl: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.VOICE_LEAVE_SOUND_URL, v);
    } catch {}
  }, []);

  const setMicSensitivity = useCallback((v: number) => {
    const val = Math.max(-100, Math.min(0, v));
    setSettings((s) => ({ ...s, micSensitivity: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.MIC_SENSITIVITY, String(val));
    } catch {}
  }, []);

  const setTimeFormat = useCallback((v: TimeFormatId) => {
    if (v !== '12' && v !== '24') return;
    setSettings((s) => ({ ...s, timeFormat: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.TIME_FORMAT, v);
    } catch {}
  }, []);

  const setScreenShareVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(2, v));
    setSettings((s) => ({ ...s, screenShareVolume: val }));
    try {
      localStorage.setItem(SETTINGS_KEYS.SCREEN_SHARE_VOLUME, String(val));
    } catch {}
  }, []);

  const setNeonEnabled = useCallback((v: boolean) => {
    setSettings((s) => ({ ...s, neonEnabled: v }));
    try {
      localStorage.setItem(SETTINGS_KEYS.NEON_ENABLED, v ? 'true' : 'false');
    } catch {}
  }, []);

  const setNeonColor = useCallback((v: string) => {
    const hex = parseHex(v) ? v : DEFAULT_SETTINGS.neonColor;
    setSettings((s) => ({ ...s, neonColor: hex }));
    try {
      localStorage.setItem(SETTINGS_KEYS.NEON_COLOR, hex);
    } catch {}
  }, []);

  const setUiFont = useCallback((v: UiFontId) => {
    const id = normalizeUiFontId(v);
    setSettings((s) => ({ ...s, uiFont: id }));
    try {
      localStorage.setItem(SETTINGS_KEYS.UI_FONT, id);
    } catch {}
  }, []);

  const getServerChatBackground = useCallback((serverId: string | null) => {
    return getServerChatBackgroundFromStorage(serverId);
  }, [serverChatBackgroundVersion]);

  const setServerChatBackground = useCallback((serverId: string | null, background: ChatBackgroundId, imageUrl?: string, imageFit?: BackgroundImageFit) => {
    if (!serverId) return;
    try {
      localStorage.setItem(SERVER_CHAT_BG_KEY + serverId, background);
      if (background === 'custom' && imageUrl != null) {
        localStorage.setItem(SERVER_CHAT_BG_IMG_KEY + serverId, imageUrl);
      } else {
        localStorage.removeItem(SERVER_CHAT_BG_IMG_KEY + serverId);
      }
      if (imageFit != null && VALID_FITS.includes(imageFit)) {
        localStorage.setItem(SERVER_CHAT_BG_FIT_KEY + serverId, imageFit);
      }
      setServerChatBackgroundVersion((v) => v + 1);
    } catch {}
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setMicVolume, setSpeakerVolume, setNameColor, setChatFontSize, setAvatar, setTheme, setThemeHue, setChatBackground, setTaskRecorderEnabled, setWebRtcDiagnosticsEnabled, setVoiceSessionTraceEnabled, setVoiceJoinSound, setVoiceLeaveSound, setVoiceJoinSoundUrl, setVoiceLeaveSoundUrl, setMicSensitivity, setTimeFormat, setScreenShareVolume, setNeonEnabled, setNeonColor, setUiFont, serverChatBackgroundVersion, getServerChatBackground, setServerChatBackground }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
