import { API_BASE, SOCKET_URL, isNativeApp } from '../config';
import { api } from '../services/api';
import { io, Socket } from 'socket.io-client';

/**
 * In-flight authorization code exchange promise cache
 * Completely prevents race conditions between WebSocket, Polling, and Deep Link
 */
const inFlightExchanges = new Map<string, Promise<{ token: string; refreshToken?: string; user: any }>>();

export async function safeExchangeAuthCode(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<{ token: string; refreshToken?: string; user: any }> {
  if (inFlightExchanges.has(code)) {
    return inFlightExchanges.get(code)!;
  }

  const exchangePromise = (async () => {
    try {
      const result = await api.exchangeAuthCode(code, verifier, redirectUri);
      return result;
    } finally {
      setTimeout(() => inFlightExchanges.delete(code), 20000);
    }
  })();

  inFlightExchanges.set(code, exchangePromise);
  return exchangePromise;
}

/**
 * Generates high-entropy random string for PKCE code verifier (RFC 7636)
 */
export function generateCodeVerifier(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join('');
}

/**
 * Computes PKCE code challenge: S256 or falls back cleanly to plain if SubtleCrypto is unavailable
 */
export async function generateCodeChallenge(verifier: string): Promise<{ challenge: string; method: 'S256' | 'plain' }> {
  if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await window.crypto.subtle.digest('SHA-256', data);

      // Convert ArrayBuffer to Base64URL string
      const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
      const challenge = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return { challenge, method: 'S256' };
    } catch (e) {
      console.warn('[PKCE] SubtleCrypto failed, falling back to plain challenge:', e);
    }
  }

  return { challenge: verifier, method: 'plain' };
}

/**
 * Initiates native OAuth flow for Electron (Windows) or Capacitor (Android)
 * Uses system external browser + WebSocket / Polling / Deep link callback
 */
export async function startNativeOAuth(
  provider: 'google' | 'github' | 'telegram',
  onSuccess?: (authData: { token: string; refreshToken?: string; user: any }) => void,
  onError?: (err: Error) => void
): Promise<void> {
  const verifier = generateCodeVerifier();
  const { challenge, method } = await generateCodeChallenge(verifier);
  const state = 'nat_' + generateCodeVerifier(16);
  const redirectUri = 'pulsechat://auth/callback';

  sessionStorage.setItem('pulse_pkce_verifier', verifier);
  sessionStorage.setItem('pulse_pkce_state', state);
  localStorage.setItem('pulse_pkce_verifier', verifier);
  localStorage.setItem('pulse_pkce_state', state);

  try {
    const session = await api.createNativeAuthSession(provider, challenge, method, redirectUri, state);
    const authUrl = session.authUrl;

    // Bind verifier to this specific session ID as well for fail-safe retrieval
    localStorage.setItem(`pulse_pkce_verifier_${session.nativeSessionId}`, verifier);

    // Open authUrl in external system browser (not inside WebView/Electron frame)
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(authUrl);
    } else {
      const win = window.open(authUrl, '_system');
      if (!win) {
        window.open(authUrl, '_blank');
      }
    }

    let completed = false;
    let sock: Socket | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (sock) {
        try {
          sock.disconnect();
        } catch (_) {}
        sock = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleSuccess = async (code: string) => {
      if (completed) return;
      completed = true;
      cleanup();

      try {
        const result = await safeExchangeAuthCode(code, verifier, redirectUri);
        localStorage.removeItem('pulse_pkce_verifier');
        localStorage.removeItem('pulse_pkce_state');
        localStorage.removeItem(`pulse_pkce_verifier_${session.nativeSessionId}`);
        sessionStorage.removeItem('pulse_pkce_verifier');
        sessionStorage.removeItem('pulse_pkce_state');

        // Automatically bring Electron window to front upon successful auth
        try {
          (window as any).electronAPI?.focusWindow?.();
        } catch (_) {}

        // Dispatch custom event for ChatContext
        window.dispatchEvent(new CustomEvent('pulse:auth-success', { detail: result }));

        if (onSuccess) {
          onSuccess(result);
        }
      } catch (err: any) {
        if (onError) onError(err);
      }
    };

    // 1. Listen via WebSocket anonymous room
    try {
      sock = io(SOCKET_URL, {
        auth: { anonymousAuth: true },
        transports: ['websocket', 'polling'],
      });

      sock.on('connect', () => {
        sock?.emit('native_auth_listen', session.nativeSessionId);
      });

      sock.on('native_auth_success', (data: { code: string; state?: string }) => {
        handleSuccess(data.code);
      });
    } catch (e) {
      console.warn('Socket connect failed, falling back to polling:', e);
    }

    // 2. Fallback polling every 1000ms (1 second) for instant native login
    pollInterval = setInterval(async () => {
      if (completed) return;
      try {
        const check = await api.checkNativeAuthSession(session.nativeSessionId);
        if (check.status === 'completed' && check.code) {
          handleSuccess(check.code);
        }
      } catch (_) {}
    }, 1000);

    // Timeout after 10 minutes
    setTimeout(() => {
      if (!completed) {
        cleanup();
        onError?.(new Error('Время ожидания авторизации истекло'));
      }
    }, 10 * 60 * 1000);
  } catch (err: any) {
    console.error('Failed to start native OAuth session:', err);
    if (onError) onError(err);
    throw err;
  }
}

/**
 * Initiates PKCE-protected OAuth flow via system or web browser
 */
export async function startOAuthPKCE(
  provider: 'google' | 'github' | 'telegram',
  callbacks?: {
    onSuccess?: (authData: any) => void;
    onError?: (err: Error) => void;
  }
): Promise<void> {
  if (isNativeApp) {
    return startNativeOAuth(provider, callbacks?.onSuccess, callbacks?.onError);
  }

  const verifier = generateCodeVerifier();
  const { challenge, method } = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier(16);

  sessionStorage.setItem('pulse_pkce_verifier', verifier);
  sessionStorage.setItem('pulse_pkce_state', state);

  const redirectUri = `${window.location.origin}/`;
  const url = new URL(`${API_BASE}/auth/${provider}`);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', method);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  window.location.href = url.toString();
}
