import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'pulse-chat-super-secure-jwt-key-2026';
const ACCESS_TOKEN_TTL = '15m'; // Short-lived access token
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 60 * 1000; // 60 seconds TTL for PKCE one-time auth code

export interface TokenPayload {
  userId: string;
  username: string;
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  sessionId?: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Signs a short-lived access token (15 minutes)
 */
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// Backwards compatibility alias
export const signToken = signAccessToken;

/**
 * Verifies JWT access token
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// Backwards compatibility alias
export const verifyToken = verifyAccessToken;

/**
 * Helper to parse user device info from User-Agent
 */
export function parseDeviceInfo(userAgent?: string): string {
  if (!userAgent) return 'Неизвестное устройство';
  if (/PulseElectron/i.test(userAgent) || /Electron/i.test(userAgent)) {
    if (/Windows/i.test(userAgent)) return 'Windows Desktop (Electron)';
    if (/Macintosh|Mac OS/i.test(userAgent)) return 'macOS Desktop (Electron)';
    return 'Desktop App (Electron)';
  }
  if (/Capacitor/i.test(userAgent) || /PulseAndroid/i.test(userAgent)) {
    return 'Android App (PulseChat)';
  }
  if (/Android/i.test(userAgent)) {
    return 'Android Browser (Chrome/Web)';
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'iOS Browser (Safari/Web)';
  }
  if (/Windows/i.test(userAgent)) {
    return 'Windows PC (Браузер)';
  }
  if (/Macintosh|Mac OS/i.test(userAgent)) {
    return 'Mac (Браузер)';
  }
  if (/Linux/i.test(userAgent)) {
    return 'Linux (Браузер)';
  }
  return 'Веб-браузер';
}

/**
 * Creates a new refresh token and session in DB
 */
export async function createSession(
  userId: string,
  deviceInfo: string,
  ipAddress: string,
  familyId?: string
): Promise<{ accessToken: string; refreshToken: string; sessionId: string; familyId: string }> {
  const sessionId = crypto.randomUUID();
  const rawRefreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const finalFamilyId = familyId || crypto.randomUUID();

  await db.run(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, family_id, is_revoked, expires_at, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `, sessionId, userId, tokenHash, deviceInfo, ipAddress, finalFamilyId, expiresAt, now, now);

  // Fetch username for token payload
  const user = await db.get<{ username: string }>('SELECT username FROM users WHERE id = ?', userId);
  const username = user?.username || '';

  const accessToken = signAccessToken({ userId, username, sessionId });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    sessionId,
    familyId: finalFamilyId,
  };
}

/**
 * Rotates refresh token with reuse detection (family invalidation)
 */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  deviceInfo: string,
  ipAddress: string
): Promise<
  | { success: true; accessToken: string; refreshToken: string; sessionId: string; userId: string; username: string }
  | { success: false; reason: 'not_found' | 'reused' | 'expired' }
> {
  const tokenHash = hashToken(rawRefreshToken);

  const tokenRow = await db.get<{
    id: string;
    user_id: string;
    family_id: string;
    is_revoked: number;
    expires_at: string;
  }>('SELECT id, user_id, family_id, is_revoked, expires_at FROM refresh_tokens WHERE token_hash = ?', tokenHash);

  if (!tokenRow) {
    return { success: false, reason: 'not_found' };
  }

  // Token reuse detection! If already revoked token is submitted, someone compromised it!
  // Invalidate all tokens in the family to protect the user
  if (tokenRow.is_revoked === 1 || (tokenRow.is_revoked as any) === true) {
    console.warn(`[SECURITY WARNING] Refresh token reuse detected for family ${tokenRow.family_id}! Revoking family.`);
    await db.run('UPDATE refresh_tokens SET is_revoked = 1 WHERE family_id = ?', tokenRow.family_id);
    return { success: false, reason: 'reused' };
  }

  // Check expiration
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await db.run('UPDATE refresh_tokens SET is_revoked = 1 WHERE id = ?', tokenRow.id);
    return { success: false, reason: 'expired' };
  }

  // Revoke current token
  const now = new Date().toISOString();
  await db.run('UPDATE refresh_tokens SET is_revoked = 1, last_used_at = ? WHERE id = ?', now, tokenRow.id);

  // Issue new session in the same family
  const newSession = await createSession(tokenRow.user_id, deviceInfo, ipAddress, tokenRow.family_id);
  const user = await db.get<{ username: string }>('SELECT username FROM users WHERE id = ?', tokenRow.user_id);

  return {
    success: true,
    accessToken: newSession.accessToken,
    refreshToken: newSession.refreshToken,
    sessionId: newSession.sessionId,
    userId: tokenRow.user_id,
    username: user?.username || '',
  };
}

/**
 * Revokes a single session by id
 */
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const res = await db.run('UPDATE refresh_tokens SET is_revoked = 1 WHERE id = ? AND user_id = ?', sessionId, userId);
  return res.changes > 0;
}

/**
 * Revokes all other sessions for a user except the current one
 */
export async function revokeAllOtherSessions(currentSessionId: string, userId: string): Promise<number> {
  const res = await db.run(
    'UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ? AND id != ? AND is_revoked = 0',
    userId,
    currentSessionId
  );
  return res.changes;
}

/**
 * Gets all active sessions for a user
 */
export async function getUserSessions(userId: string, currentSessionId?: string) {
  const rows = await db.all<any>(`
    SELECT id, device_info, ip_address, created_at, last_used_at, expires_at
    FROM refresh_tokens
    WHERE user_id = ? AND is_revoked = 0
    ORDER BY last_used_at DESC
  `, userId);

  const now = Date.now();
  return rows
    .filter((r) => new Date(r.expires_at).getTime() > now)
    .map((r) => ({
      id: r.id,
      deviceInfo: r.device_info || 'Устройство',
      ipAddress: r.ip_address || '',
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      isCurrent: Boolean(currentSessionId && r.id === currentSessionId),
    }));
}

/**
 * PKCE Code Verifier validation helper
 */
export function verifyPKCE(verifier: string, challenge: string, method: string = 'S256'): boolean {
  if (method === 'plain') {
    return verifier === challenge;
  }
  // S256: BASE64URL-ENCODE(SHA256(verifier))
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

/**
 * Persists an OAuth state entry into the database with 10-minute TTL.
 * Survives process restarts and cold boots between initial redirect and provider callback.
 */
export async function createOAuthState(
  provider: 'google' | 'github' | 'telegram',
  clientState?: string,
  redirectUri?: string,
  codeChallenge?: string,
  codeChallengeMethod: string = 'S256',
  nativeSessionId?: string
): Promise<string> {
  const stateId = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.run(`
    INSERT INTO oauth_states (id, provider, client_state, redirect_uri, code_challenge, code_challenge_method, native_session_id, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `, stateId, provider, clientState || '', redirectUri || '', codeChallenge || '', codeChallengeMethod, nativeSessionId || null, expiresAt, now);

  return stateId;
}

/**
 * Consumes an OAuth state entry from the database, enforcing single-use and expiration.
 */
export async function consumeOAuthState(
  stateId: string,
  provider: 'google' | 'github' | 'telegram'
): Promise<{ clientState: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string; nativeSessionId?: string | null } | null> {
  const now = new Date().toISOString();
  const row = await db.get<any>(`
    SELECT id, client_state, redirect_uri, code_challenge, code_challenge_method, native_session_id
    FROM oauth_states
    WHERE id = ? AND provider = ? AND used = 0 AND expires_at > ?
  `, stateId, provider, now);

  if (!row) {
    return null;
  }

  // Mark as used immediately to prevent replay
  await db.run('UPDATE oauth_states SET used = 1 WHERE id = ?', stateId);

  return {
    clientState: row.client_state || '',
    redirectUri: row.redirect_uri || '',
    codeChallenge: row.code_challenge || '',
    codeChallengeMethod: row.code_challenge_method || 'S256',
    nativeSessionId: row.native_session_id || null,
  };
}

/**
 * Generates an authorization code with PKCE challenge (TTL 60 seconds)
 */
export async function createAuthCode(
  userId: string,
  codeChallenge: string,
  codeChallengeMethod: string = 'S256',
  redirectUri: string
): Promise<string> {
  const code = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();

  await db.run(`
    INSERT INTO auth_codes (code, user_id, code_challenge, code_challenge_method, redirect_uri, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `, code, userId, codeChallenge, codeChallengeMethod, redirectUri, expiresAt, now);

  return code;
}

/**
 * Exchanges a one-time authorization code + PKCE verifier for tokens
 */
export async function exchangeAuthCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  deviceInfo: string,
  ipAddress: string
): Promise<
  | { success: true; accessToken: string; refreshToken: string; sessionId: string; user: { id: string; username: string; displayName: string; avatarUrl: string } }
  | { success: false; error: string; status: number }
> {
  const codeRow = await db.get<any>(`
    SELECT code, user_id, code_challenge, code_challenge_method, redirect_uri, expires_at, used
    FROM auth_codes
    WHERE code = ?
  `, code);

  if (!codeRow) {
    return { success: false, error: 'Неверный код авторизации', status: 400 };
  }

  if (codeRow.used === 1 || codeRow.used === true) {
    return { success: false, error: 'Код авторизации уже был использован', status: 400 };
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Срок действия кода авторизации истёк (TTL 60 сек)', status: 400 };
  }

  // Redirect URI must match what was registered
  if (codeRow.redirect_uri !== redirectUri) {
    return { success: false, error: 'Несовпадение redirect_uri', status: 400 };
  }

  // Verify PKCE
  const isPkceValid = verifyPKCE(codeVerifier, codeRow.code_challenge, codeRow.code_challenge_method);
  if (!isPkceValid) {
    return { success: false, error: 'Недействительный PKCE code_verifier', status: 400 };
  }

  // Invalidate code
  await db.run('UPDATE auth_codes SET used = 1 WHERE code = ?', code);

  // Fetch user
  const user = await db.get<any>('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?', codeRow.user_id);
  if (!user) {
    return { success: false, error: 'Пользователь не найден', status: 404 };
  }

  // Issue session with access and refresh tokens
  const session = await createSession(user.id, deviceInfo, ipAddress);

  return {
    success: true,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  };
}

/**
 * Express middleware for requiring valid access token
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired access token' });
  }

  req.user = payload;
  req.sessionId = payload.sessionId;
  next();
}
