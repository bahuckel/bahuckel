/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_ORIGIN?: string;
}

interface Window {
  /** Optional: set before app bundle loads to force API/WebSocket base (e.g. https://your-server.com). */
  __BAHUCKEL_API_ORIGIN__?: string;
}
