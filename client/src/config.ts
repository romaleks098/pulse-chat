// Centralized client configuration for Web, Electron (Windows), and Capacitor (Android)

export const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);
export const isCapacitor = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());

// Fallback to production URL when running inside a native shell (Capacitor or Electron) or file:// protocol
const defaultRemoteBackend = 'https://pulse-chat-qel7.onrender.com';

const getBackendUrl = (): string => {
  // If explicitly provided via Vite environment variable:
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  // Inside Electron or Capacitor native app:
  if (isCapacitor || isElectron || window.location.protocol === 'file:') {
    return defaultRemoteBackend;
  }

  // Local development in browser (e.g. Vite dev on localhost:5173 connecting to local express on localhost:3001)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (window.location.port === '5173') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }

  // Default web app (running on Render or custom domain)
  return window.location.origin;
};

export const BACKEND_URL = getBackendUrl();
export const API_BASE = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;

// Public link domain for user profiles (@username)
export const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || BACKEND_URL.replace(/^https?:\/\//, '');
