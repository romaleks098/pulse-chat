import { API_BASE } from '../config';

/**
 * Generates high-entropy random string for PKCE code verifier (RFC 7636)
 */
export function generateCodeVerifier(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join('');
}

/**
 * Computes S256 code challenge: BASE64URL(SHA256(code_verifier))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  
  // Convert ArrayBuffer to Base64URL string
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Initiates PKCE-protected OAuth flow via system/web browser
 */
export async function startOAuthPKCE(provider: 'google' | 'github' | 'telegram') {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier(16);

  // Store in sessionStorage for exchange after redirect
  sessionStorage.setItem('pulse_pkce_verifier', verifier);
  sessionStorage.setItem('pulse_pkce_state', state);

  const redirectUri = `${window.location.origin}/`;
  const url = new URL(`${API_BASE}/auth/${provider}`);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  window.location.href = url.toString();
}
