// Centralized Runtime Network Configuration for Web, Electron (Windows .exe), and Capacitor (Android .apk)

export const PRODUCTION_REMOTE_BACKEND = 'https://pulse-chat-qel7.onrender.com';

export const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

export const isCapacitor = typeof window !== 'undefined' && (
  Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
  window.location.protocol === 'capacitor:' ||
  window.location.origin === 'capacitor://localhost' ||
  (window.location.hostname === 'localhost' && window.location.port === '' && navigator.userAgent.includes('Android'))
);

export const isNativeApp = isElectron || isCapacitor || (typeof window !== 'undefined' && window.location.protocol === 'file:');

export const getRuntimeBackendUrl = (): string => {
  // 1. Explicit environment override during build or dev
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  // 2. Native application shell (Capacitor on Android, Electron on Desktop, or file:// protocol)
  if (
    isNativeApp ||
    (typeof window !== 'undefined' &&
      (window.location.protocol === 'capacitor:' ||
        window.location.origin === 'capacitor://localhost' ||
        window.location.protocol === 'file:'))
  ) {
    return PRODUCTION_REMOTE_BACKEND;
  }

  // 3. Local development in browser (e.g. Vite dev on localhost:5173 connecting to local express on localhost:3001)
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5173') {
        return 'http://localhost:3001';
      }
      return window.location.origin;
    }
    // 4. Default web app running on Render or custom domain
    return window.location.origin;
  }

  return PRODUCTION_REMOTE_BACKEND;
};

export const BACKEND_URL = getRuntimeBackendUrl();
export const API_BASE = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;
export const PUBLIC_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_URL) ||
  BACKEND_URL.replace(/^https?:\/\//, '');
