export const USERNAME_STORAGE_KEY = 'bahuckel_username';
export const SESSION_TOKEN_KEY = 'bahuckel_session_token';

export const SETTINGS_KEYS = {
  MIC_VOLUME: 'bahuckel_mic_volume',
  SPEAKER_VOLUME: 'bahuckel_speaker_volume',
  NAME_COLOR: 'bahuckel_name_color',
  CHAT_FONT_SIZE: 'bahuckel_chat_font_size',
  AVATAR: 'bahuckel_avatar',
  THEME: 'bahuckel_theme',
  THEME_HUE: 'bahuckel_theme_hue',
  CHAT_BACKGROUND: 'bahuckel_chat_background',
  TASK_RECORDER_ENABLED: 'bahuckel_task_recorder_enabled',
  WEBRTC_DIAGNOSTICS_ENABLED: 'bahuckel_webrtc_diagnostics_enabled',
  VOICE_SESSION_TRACE: 'bahuckel_voice_session_trace',
  VOICE_JOIN_SOUND: 'bahuckel_voice_join_sound',
  VOICE_LEAVE_SOUND: 'bahuckel_voice_leave_sound',
  VOICE_JOIN_SOUND_URL: 'bahuckel_voice_join_sound_url',
  VOICE_LEAVE_SOUND_URL: 'bahuckel_voice_leave_sound_url',
  MIC_SENSITIVITY: 'bahuckel_mic_sensitivity',
  TIME_FORMAT: 'bahuckel_time_format',
  SCREEN_SHARE_VOLUME: 'bahuckel_screen_share_volume',
  NEON_ENABLED: 'bahuckel_neon_enabled',
  NEON_COLOR: 'bahuckel_neon_color',
  UI_FONT: 'bahuckel_ui_font',
} as const;

export type TimeFormatId = '12' | '24';

/** App UI font: maps to CSS stacks that prefer common OS-installed fonts with safe fallbacks. */
export type UiFontId =
  | 'default'
  | 'system-ui'
  | 'segoe-ui'
  | 'arial'
  | 'verdana'
  | 'tahoma'
  | 'trebuchet-ms'
  | 'calibri'
  | 'cambria'
  | 'georgia'
  | 'times-new-roman'
  | 'courier-new'
  | 'consolas'
  | 'helvetica-neue'
  | 'ui-serif'
  | 'ui-rounded';

export const UI_FONT_OPTIONS: { id: UiFontId; label: string; stack: string }[] = [
  { id: 'default', label: 'Default (Bahuckel)', stack: "'gg sans', 'Noto Sans', system-ui, sans-serif" },
  { id: 'system-ui', label: 'System UI', stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'segoe-ui', label: 'Segoe UI', stack: '"Segoe UI", "Segoe UI Variable", "Segoe UI Historic", system-ui, sans-serif' },
  { id: 'arial', label: 'Arial', stack: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Verdana, Geneva, sans-serif' },
  { id: 'trebuchet-ms', label: 'Trebuchet MS', stack: '"Trebuchet MS", "Lucida Grande", Arial, sans-serif' },
  { id: 'calibri', label: 'Calibri', stack: 'Calibri, "Segoe UI", Candara, Verdana, sans-serif' },
  { id: 'cambria', label: 'Cambria', stack: 'Cambria, Georgia, "Times New Roman", serif' },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'times-new-roman', label: 'Times New Roman', stack: '"Times New Roman", Times, Georgia, serif' },
  { id: 'courier-new', label: 'Courier New', stack: '"Courier New", Courier, "Liberation Mono", monospace' },
  { id: 'consolas', label: 'Consolas', stack: 'Consolas, "Courier New", monospace' },
  { id: 'helvetica-neue', label: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'ui-serif', label: 'System serif', stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' },
  { id: 'ui-rounded', label: 'System rounded', stack: 'ui-rounded, system-ui, "SF Pro Rounded", "Hiragino Maru Gothic ProN", sans-serif' },
];

const UI_FONT_IDS = new Set(UI_FONT_OPTIONS.map((o) => o.id));

export function normalizeUiFontId(raw: string | null | undefined): UiFontId {
  if (raw && UI_FONT_IDS.has(raw as UiFontId)) return raw as UiFontId;
  return 'default';
}

export function getUiFontStack(id: UiFontId): string {
  return UI_FONT_OPTIONS.find((o) => o.id === id)?.stack ?? UI_FONT_OPTIONS[0].stack;
}

export const DEFAULT_SETTINGS = {
  micVolume: 1,
  speakerVolume: 1,
  nameColor: '#5865f2',
  chatFontSize: 14,
  avatar: '',
  theme: 'dark',
  themeHue: 220,
  chatBackground: 'default',
  taskRecorderEnabled: false,
  webrtcDiagnosticsEnabled: false,
  voiceSessionTraceEnabled: false,
  voiceJoinSound: 'chime' as VoiceSoundId,
  voiceLeaveSound: 'pop' as VoiceSoundId,
  micSensitivity: -50,
  timeFormat: '24' as TimeFormatId,
  screenShareVolume: 1,
  neonEnabled: true,
  neonColor: '#00d4ff',
  uiFont: 'default' as UiFontId,
};

export type VoiceSoundId = 'chime' | 'pop' | 'click' | 'bell' | 'none' | 'custom';

export const VOICE_SOUND_PRESETS: { id: VoiceSoundId; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'pop', label: 'Pop' },
  { id: 'click', label: 'Click' },
  { id: 'bell', label: 'Bell' },
  { id: 'none', label: 'None' },
];

export type ChatBackgroundId = 'default' | 'bubbles-dark' | 'bubbles-light' | 'custom';

export const CHAT_BACKGROUND_OPTIONS: { value: ChatBackgroundId; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'bubbles-dark', label: 'Bubbles (dark)' },
  { value: 'bubbles-light', label: 'Bubbles (light)' },
  { value: 'custom', label: 'Custom image' },
];

/** localStorage key prefix for per-server chat background (suffix = serverId). */
export const SERVER_CHAT_BG_KEY = 'bahuckel_chat_bg_';
/** localStorage key prefix for per-server custom background image (suffix = serverId). */
export const SERVER_CHAT_BG_IMG_KEY = 'bahuckel_chat_bg_img_';
/** localStorage key prefix for per-server custom image fit (suffix = serverId). */
export const SERVER_CHAT_BG_FIT_KEY = 'bahuckel_chat_bg_fit_';

/** How the custom background image is displayed (like Windows wallpaper). */
export type BackgroundImageFit = 'fill' | 'fit' | 'stretch' | 'center' | 'tile';

export const BACKGROUND_IMAGE_FIT_OPTIONS: { value: BackgroundImageFit; label: string }[] = [
  { value: 'fill', label: 'Fill (cover)' },
  { value: 'fit', label: 'Fit (contain)' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'center', label: 'Center' },
  { value: 'tile', label: 'Tile' },
];

export const CHAT_FONT_SIZE_MIN = 10;
export const CHAT_FONT_SIZE_MAX = 96;


/** Video stream resolution modes - keep aspect ratio, scale to fit (no crop). */
export const STREAM_MODES = {
  '720p': { maxWidth: 1280, maxHeight: 720 },
  '1080p': { maxWidth: 1920, maxHeight: 1080 },
  Source: { maxWidth: Infinity, maxHeight: Infinity },
} as const;

export type ThemeId = 'dark' | 'light' | 'blue' | 'midnight' | 'custom';

/** Generate theme vars from hue (0–360). Keeps depth: darker parts dark, lighter light. */
export function themeFromHue(hue: number, dark: boolean = true): Record<string, string> {
  const h = Math.round(hue) % 360;
  if (dark) {
    return {
      '--bg-primary': `hsl(${h}, 32%, 18%)`,
      '--bg-secondary': `hsl(${h}, 34%, 14%)`,
      '--bg-tertiary': `hsl(${h}, 36%, 10%)`,
      '--bg-hover': `hsl(${h}, 35%, 24%)`,
      '--text-primary': `hsl(${h}, 12%, 94%)`,
      '--text-secondary': `hsl(${h}, 18%, 72%)`,
      '--accent': `hsl(${h}, 65%, 55%)`,
      '--accent-hover': `hsl(${h}, 65%, 48%)`,
      '--border-subtle': `hsla(${h}, 25%, 100%, 0.08)`,
      '--radius-sm': '8px',
      '--radius-md': '12px',
      '--radius-lg': '16px',
    };
  } else {
    return {
      '--bg-primary': `hsl(${h}, 20%, 100%)`,
      '--bg-secondary': `hsl(${h}, 18%, 96%)`,
      '--bg-tertiary': `hsl(${h}, 22%, 92%)`,
      '--bg-hover': `hsl(${h}, 20%, 88%)`,
      '--text-primary': `hsl(${h}, 30%, 18%)`,
      '--text-secondary': `hsl(${h}, 20%, 45%)`,
      '--accent': `hsl(${h}, 65%, 45%)`,
      '--accent-hover': `hsl(${h}, 65%, 38%)`,
      '--border-subtle': `hsla(${h}, 20%, 0%, 0.08)`,
      '--radius-sm': '8px',
      '--radius-md': '12px',
      '--radius-lg': '16px',
    };
  }
}

export const THEMES: Record<Exclude<ThemeId, 'custom'>, Record<string, string>> = {
  dark: {
    '--bg-primary': '#313338',
    '--bg-secondary': '#2b2d31',
    '--bg-tertiary': '#1e1f22',
    '--bg-hover': '#3f4147',
    '--text-primary': '#f2f3f5',
    '--text-secondary': '#b5bac1',
    '--accent': '#5865f2',
    '--accent-hover': '#4752c4',
    '--border-subtle': 'rgba(255, 255, 255, 0.06)',
    '--radius-sm': '8px',
    '--radius-md': '12px',
    '--radius-lg': '16px',
  },
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f2f3f5',
    '--bg-tertiary': '#e3e5e8',
    '--bg-hover': '#d4d7dc',
    '--text-primary': '#2e3338',
    '--text-secondary': '#747f8d',
    '--accent': '#5865f2',
    '--accent-hover': '#4752c4',
    '--border-subtle': 'rgba(0, 0, 0, 0.06)',
    '--radius-sm': '8px',
    '--radius-md': '12px',
    '--radius-lg': '16px',
  },
  blue: {
    '--bg-primary': 'hsl(212, 35%, 18%)',
    '--bg-secondary': 'hsl(212, 38%, 14%)',
    '--bg-tertiary': 'hsl(212, 40%, 10%)',
    '--bg-hover': 'hsl(212, 45%, 26%)',
    '--text-primary': 'hsl(212, 15%, 94%)',
    '--text-secondary': 'hsl(212, 20%, 72%)',
    '--accent': 'hsl(212, 85%, 55%)',
    '--accent-hover': 'hsl(212, 85%, 48%)',
    '--border-subtle': 'hsla(212, 30%, 100%, 0.08)',
    '--radius-sm': '10px',
    '--radius-md': '14px',
    '--radius-lg': '18px',
  },
  midnight: {
    '--bg-primary': 'hsl(240, 8%, 14%)',
    '--bg-secondary': 'hsl(240, 8%, 10%)',
    '--bg-tertiary': 'hsl(240, 10%, 6%)',
    '--bg-hover': 'hsl(240, 10%, 22%)',
    '--text-primary': 'hsl(240, 10%, 96%)',
    '--text-secondary': 'hsl(240, 8%, 68%)',
    '--accent': 'hsl(217, 100%, 55%)',
    '--accent-hover': 'hsl(217, 100%, 65%)',
    '--border-subtle': 'hsla(240, 15%, 100%, 0.08)',
    '--radius-sm': '10px',
    '--radius-md': '14px',
    '--radius-lg': '18px',
  },
};
