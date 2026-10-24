import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { notifyTelegramAuthSuccess, notifyNativeAuthSuccess } from '../socket.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  createSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllOtherSessions,
  getUserSessions,
  createAuthCode,
  exchangeAuthCode,
  createOAuthState,
  consumeOAuthState,
  parseDeviceInfo,
  requireAuth,
  AuthenticatedRequest,
} from '../auth.js';

export const authRouter = Router();

// ============================================================================
// RATE LIMITER FOR AUTH ENDPOINTS (prevents brute-force on passwords and codes)
// ============================================================================
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const authRateLimits = new Map<string, RateLimitRecord>();

function authRateLimiter(maxRequests: number = 30, windowMs: number = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = authRateLimits.get(ip);

    if (!record || now > record.resetAt) {
      authRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
      return res.status(429).json({
        error: `Слишком много запросов авторизации. Повторите попытку через ${waitSeconds} сек.`,
      });
    }

    next();
  };
}

// Cleanup rate limiter map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of authRateLimits.entries()) {
    if (now > rec.resetAt) authRateLimits.delete(ip);
  }
}, 5 * 60 * 1000);

// Helper for setting secure refresh cookie
function setRefreshCookie(res: Response, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('pulse_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'lax' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('pulse_refresh_token', {
    httpOnly: true,
    path: '/api/auth',
  });
}

// Allowed redirect URIs for PKCE OAuth exchange
const ALLOWED_REDIRECT_URIS = [
  'https://pulse-chat-qel7.onrender.com/auth/callback',
  'https://pulse-chat-qel7.onrender.com/',
  'http://localhost:5173/auth/callback',
  'http://localhost:5173/',
  'http://localhost:3001/auth/callback',
  'pulsechat://auth/callback',
  'pulsechat://',
  'app://pulsechat/auth/callback',
  'app://pulse/auth/callback',
  'capacitor://localhost/auth/callback',
];

function isAllowedRedirectUri(uri: string): boolean {
  if (!uri) return false;
  return ALLOWED_REDIRECT_URIS.some((allowed) => uri === allowed || uri.startsWith(allowed));
}

// ============================================================================
// 1. REGISTRATION
// ============================================================================
authRouter.post('/register', authRateLimiter(20), async (req, res) => {
  const { username, password, displayName, avatarUrl } = req.body;

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Username, password and display name are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ?', cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const finalAvatar = avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, userId, cleanUsername, displayName.trim(), passwordHash, finalAvatar, now);

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
    const ip = req.ip || req.socket.remoteAddress || '';
    const session = await createSession(userId, deviceInfo, ip);

    setRefreshCookie(res, session.refreshToken);

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: userId,
        username: cleanUsername,
        displayName: displayName.trim(),
        avatarUrl: finalAvatar,
        statusText: '',
      },
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// 2. LOGIN
// ============================================================================
authRouter.post('/login', authRateLimiter(25), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const user = await db.get<any>('SELECT * FROM users WHERE username = ?', cleanUsername);
    if (!user) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
    const ip = req.ip || req.socket.remoteAddress || '';
    const session = await createSession(user.id, deviceInfo, ip);

    setRefreshCookie(res, session.refreshToken);

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        statusText: user.status_text || '',
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// 3. SOCIAL LOGIN (TELEGRAM / GOOGLE / GITHUB IN-APP)
// ============================================================================
authRouter.post('/social', authRateLimiter(30), async (req, res) => {
  const { provider, data } = req.body;
  if (!provider || !data || !data.id) {
    return res.status(400).json({ error: 'Не переданы данные провайдера' });
  }

  const providerId = String(data.id);
  const { telegramBotToken } = getOAuthEnv();

  // Check Telegram signature if bot token is provided
  if (provider === 'telegram' && telegramBotToken && data.hash) {
    try {
      const dataCheckArr: string[] = [];
      for (const key of Object.keys(data).sort()) {
        if (key !== 'hash') {
          dataCheckArr.push(`${key}=${data[key]}`);
        }
      }
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(telegramBotToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== data.hash) {
        return res.status(401).json({ error: 'Неверная подпись Telegram авторизации' });
      }
    } catch (err) {
      console.error('Telegram verify error:', err);
      return res.status(401).json({ error: 'Ошибка проверки Telegram' });
    }
  }

  try {
    let user = await db.get<any>('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ?', provider, providerId);

    if (!user) {
      let baseUsername = (data.username || `${provider}_${providerId}`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (baseUsername.length < 3) baseUsername = `${provider}_user`;

      let finalUsername = baseUsername;
      let counter = 1;
      while (await db.get('SELECT 1 FROM users WHERE username = ?', finalUsername)) {
        finalUsername = `${baseUsername}_${counter++}`;
      }

      const userId = crypto.randomUUID();
      const displayName = (data.displayName || data.first_name || finalUsername).trim();
      const avatarUrl = data.avatarUrl || data.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${finalUsername}`;
      const passwordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO users (id, username, display_name, password_hash, avatar_url, auth_provider, provider_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, userId, finalUsername, displayName, passwordHash, avatarUrl, provider, providerId, now);

      user = {
        id: userId,
        username: finalUsername,
        display_name: displayName,
        avatar_url: avatarUrl,
        status_text: '',
      };
    }

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
    const ip = req.ip || req.socket.remoteAddress || '';
    const session = await createSession(user.id, deviceInfo, ip);

    setRefreshCookie(res, session.refreshToken);

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        statusText: user.status_text || '',
      },
    });
  } catch (err) {
    console.error('Social auth error:', err);
    res.status(500).json({ error: 'Ошибка социальной авторизации' });
  }
});

// ============================================================================
// 4. TOKEN REFRESH (With Family Rotation & Reuse Detection)
// ============================================================================
authRouter.post('/refresh', authRateLimiter(60), async (req, res) => {
  // Read refresh token from httpOnly cookie, X-Refresh-Token header, or request body
  const rawRefreshToken =
    req.cookies?.pulse_refresh_token ||
    (req.headers['x-refresh-token'] as string) ||
    req.body?.refreshToken;

  if (!rawRefreshToken) {
    return res.status(401).json({ error: 'Refresh-токен отсутствует' });
  }

  const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || '';

  try {
    const rotation = await rotateRefreshToken(rawRefreshToken, deviceInfo, ip);

    if (!rotation.success) {
      clearRefreshCookie(res);
      if (rotation.reason === 'reused') {
        return res.status(401).json({
          error: 'Обнаружено повторное использование токена. В целях безопасности все сессии сброшены.',
          tokenReused: true,
        });
      }
      return res.status(401).json({ error: 'Недействительный или просроченный refresh-токен' });
    }

    // Set new rotated refresh token in cookie
    setRefreshCookie(res, rotation.refreshToken);

    // Fetch user details
    const user = await db.get<any>(
      'SELECT id, username, display_name, avatar_url, status_text FROM users WHERE id = ?',
      rotation.userId
    );

    res.json({
      token: rotation.accessToken,
      refreshToken: rotation.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        statusText: user.status_text || '',
      },
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    clearRefreshCookie(res);
    res.status(500).json({ error: 'Ошибка обновления токена' });
  }
});

// ============================================================================
// 5. LOGOUT (Revokes Current Session)
// ============================================================================
authRouter.post('/logout', async (req: AuthenticatedRequest, res) => {
  const rawRefreshToken =
    req.cookies?.pulse_refresh_token ||
    (req.headers['x-refresh-token'] as string) ||
    req.body?.refreshToken;

  clearRefreshCookie(res);

  if (rawRefreshToken) {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await db.run('UPDATE refresh_tokens SET is_revoked = 1 WHERE token_hash = ?', tokenHash);
  }

  if (req.sessionId && req.user?.userId) {
    await revokeSession(req.sessionId, req.user.userId);
  }

  res.json({ success: true, message: 'Сессия завершена' });
});

// ============================================================================
// 6. ACTIVE SESSIONS MANAGEMENT (Для раздела «Устройства»)
// ============================================================================
authRouter.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const sessions = await getUserSessions(req.user!.userId, req.sessionId);
    res.json(sessions);
  } catch (err) {
    console.error('Fetch sessions error:', err);
    res.status(500).json({ error: 'Не удалось загрузить список устройств' });
  }
});

authRouter.delete('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const sessionId = req.params.id;
  try {
    const revoked = await revokeSession(sessionId, req.user!.userId);
    if (!revoked) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    res.json({ success: true, message: 'Сессия успешно отозвана' });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Не удалось отозвать сессию' });
  }
});

authRouter.delete('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const currentSessionId = req.sessionId || '';
    const count = await revokeAllOtherSessions(currentSessionId, req.user!.userId);
    res.json({ success: true, count, message: `Завершено других сессий: ${count}` });
  } catch (err) {
    console.error('Revoke other sessions error:', err);
    res.status(500).json({ error: 'Не удалось завершить другие сессии' });
  }
});

// ============================================================================
// 7. PKCE AUTHORIZATION CODE EXCHANGE (POST /api/auth/exchange)
// ============================================================================
authRouter.post('/exchange', authRateLimiter(30), async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body;

  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ error: 'Параметры code, code_verifier и redirect_uri обязательны' });
  }

  const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || '';

  try {
    const result = await exchangeAuthCode(code, code_verifier, redirect_uri, deviceInfo, ip);

    if (!result.success) {
      return res.status(result.status).json({ error: result.error });
    }

    setRefreshCookie(res, result.refreshToken);

    res.json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    console.error('Exchange error:', err);
    res.status(500).json({ error: 'Ошибка обмена кода авторизации' });
  }
});

// ============================================================================
// OAUTH ENVIRONMENT & CALLBACK HELPERS (with whitespace/newline trimming)
// ============================================================================

/**
 * Safely reads OAuth-related environment variables, trimming whitespace, tabs, and newlines.
 */
function getOAuthEnv() {
  const getClean = (key: string): string => {
    const val = process.env[key];
    return typeof val === 'string' ? val.trim() : '';
  };

  return {
    publicUrl: (
      getClean('PUBLIC_URL') ||
      getClean('RENDER_EXTERNAL_URL') ||
      (process.env.NODE_ENV === 'production' ? 'https://pulse-chat-qel7.onrender.com' : '')
    ).replace(/\/+$/, ''),
    googleClientId: getClean('GOOGLE_CLIENT_ID'),
    googleClientSecret: getClean('GOOGLE_CLIENT_SECRET'),
    githubClientId: getClean('GITHUB_CLIENT_ID'),
    githubClientSecret: getClean('GITHUB_CLIENT_SECRET'),
    telegramBotToken:
      getClean('TELEGRAM_BOT_TOKEN') ||
      getClean('TELEGRAM_TOKEN') ||
      getClean('BOT_TOKEN'),
    telegramBotName:
      getClean('TELEGRAM_BOT_NAME') ||
      getClean('TELEGRAM_BOT_USERNAME') ||
      getClean('VITE_TELEGRAM_BOT_USERNAME') ||
      getClean('TELEGRAM_USERNAME'),
  };
}

let cachedTelegramBotUsername: string | null = null;

/**
 * Automatically fetches the bot username from Telegram API getMe using TELEGRAM_BOT_TOKEN
 * if not explicitly provided via environment variables.
 */
export async function fetchTelegramBotUsername(): Promise<string | null> {
  const env = getOAuthEnv();
  if (env.telegramBotName) {
    return env.telegramBotName.replace(/^@/, '');
  }
  if (cachedTelegramBotUsername) {
    return cachedTelegramBotUsername;
  }
  if (!env.telegramBotToken) {
    return null;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
    const data: any = await resp.json().catch(() => ({}));
    if (data?.ok && data?.result?.username) {
      cachedTelegramBotUsername = data.result.username;
      console.log(`[Telegram] Auto-detected bot username: @${cachedTelegramBotUsername} (${data.result.first_name || ''})`);
      return cachedTelegramBotUsername;
    } else {
      console.warn('[Telegram] getMe returned error:', data?.description || data);
    }
  } catch (err: any) {
    console.error('[Telegram] Failed to fetch bot info via getMe:', err.message || err);
  }
  return null;
}

/**
 * Generates an absolute redirect callback URI using PUBLIC_URL (or host fallback),
 * guaranteeing byte-for-byte matching between authorization request and token exchange.
 */
function getCallbackUrl(req: Request, provider: 'google' | 'github'): string {
  const { publicUrl } = getOAuthEnv();
  if (publicUrl) {
    return `${publicUrl}/api/auth/${provider}/callback`;
  }
  const host = req.get('host') || 'localhost:3001';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${host}/api/auth/${provider}/callback`;
}

// Public providers configuration
authRouter.get('/providers', async (_req, res) => {
  const env = getOAuthEnv();
  const botUsername = (await fetchTelegramBotUsername()) || env.telegramBotName || null;
  res.json({
    telegramBotName: botUsername,
    googleClientId: env.googleClientId,
    githubClientId: env.githubClientId,
  });
});

// Helper for upserting OAuth user
async function upsertOAuthUser(provider: string, providerId: string, usernameBase: string, displayName: string, avatarUrl: string): Promise<string> {
  let user = await db.get<any>('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ?', provider, providerId);

  if (!user) {
    let cleanUsername = usernameBase.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) cleanUsername = `${provider}_user`;

    let finalUsername = cleanUsername;
    let counter = 1;
    while (await db.get('SELECT 1 FROM users WHERE username = ?', finalUsername)) {
      finalUsername = `${cleanUsername}_${counter++}`;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO users (id, username, display_name, password_hash, avatar_url, auth_provider, provider_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, userId, finalUsername, displayName.trim() || finalUsername, passwordHash, avatarUrl, provider, providerId, now);

    user = { id: userId, username: finalUsername };
  }

  return user.id;
}

// ============================================================================
// NATIVE APP DEVICE AUTH SESSIONS (Android .apk and Windows Desktop .exe)
// ============================================================================
interface NativeAuthSession {
  id: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'completed' | 'expired';
  provider: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  state?: string;
  authCode?: string;
  user?: any;
}

const nativeAuthSessions = new Map<string, NativeAuthSession>();

// Cleanup expired native sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of nativeAuthSessions.entries()) {
    if (sess.expiresAt < now) {
      nativeAuthSessions.delete(id);
    }
  }
}, 60 * 1000);

authRouter.post('/native/session', authRateLimiter(30), async (req, res) => {
  const provider = req.body.provider;
  const codeChallenge = req.body.code_challenge || req.body.codeChallenge || '';
  const codeChallengeMethod = req.body.code_challenge_method || req.body.codeChallengeMethod || 'S256';
  const redirectUri = req.body.redirect_uri || req.body.redirectUri || 'pulsechat://auth/callback';
  const state = req.body.state || '';

  if (!provider) {
    return res.status(400).json({ error: 'Provider is required' });
  }

  const nativeSessionId = 'nat_' + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes TTL
  const expiresAtIso = new Date(expiresAt).toISOString();
  const nowIso = new Date().toISOString();

  nativeAuthSessions.set(nativeSessionId, {
    id: nativeSessionId,
    createdAt: Date.now(),
    expiresAt,
    status: 'pending',
    provider,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    state,
  });

  // Persist into database so server restart/cold start doesn't lose the native session
  try {
    await db.run(`
      INSERT INTO native_auth_sessions (id, provider, code_challenge, code_challenge_method, redirect_uri, state, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, nativeSessionId, provider, codeChallenge, codeChallengeMethod, redirectUri, state, expiresAtIso, nowIso);
  } catch (err: any) {
    console.warn('[Native Auth] Could not persist native session to DB:', err.message);
  }

  const { publicUrl } = getOAuthEnv();
  const baseUrl = publicUrl || (process.env.NODE_ENV === 'production' ? 'https://pulse-chat-qel7.onrender.com' : 'http://localhost:3001');
  const authUrl = `${baseUrl}/api/auth/${provider}?native_session=${nativeSessionId}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state || nativeSessionId)}`;

  res.json({
    nativeSessionId,
    authUrl,
    expiresInSeconds: 600,
  });
});

authRouter.get('/native/session/:id', async (req, res) => {
  const { id } = req.params;
  let session = nativeAuthSessions.get(id);

  if (!session) {
    try {
      const row = await db.get<any>('SELECT * FROM native_auth_sessions WHERE id = ?', id);
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        session = {
          id: row.id,
          createdAt: new Date(row.created_at).getTime(),
          expiresAt: new Date(row.expires_at).getTime(),
          status: row.status,
          provider: row.provider,
          codeChallenge: row.code_challenge,
          codeChallengeMethod: row.code_challenge_method,
          redirectUri: row.redirect_uri,
          state: row.state,
          authCode: row.auth_code,
          user: row.user_profile ? JSON.parse(row.user_profile) : null,
        };
        nativeAuthSessions.set(id, session);
      }
    } catch (_) {}
  }

  if (!session || session.expiresAt < Date.now()) {
    return res.status(404).json({ error: 'Сессия устарела или не найдена', status: 'expired' });
  }

  res.json({
    status: session.status,
    code: session.authCode || null,
    state: session.state || null,
    user: session.user || null,
  });
});

// Helper to redirect OAuth callback securely without tokens in URL:
// If PKCE was initiated, creates one-time auth code and redirects to ${redirect_uri}?code=${code}&state=${state}
// If native app session, sends deep link HTML + triggers WebSocket and DOES NOT open web messenger
// If direct browser without PKCE, sets httpOnly cookie and redirects cleanly to /?auth=success
async function completeOAuthRedirect(
  req: Request,
  res: Response,
  userId: string,
  state?: string,
  codeChallenge?: string,
  codeChallengeMethod?: string,
  redirectUri?: string,
  explicitNativeSessionId?: string
) {
  // Check if this was a native app device auth session
  const nativeSessionId =
    explicitNativeSessionId ||
    (req.query.native_session as string) ||
    (state && String(state).startsWith('nat_') ? String(state) : undefined);

  if (nativeSessionId) {
    let natSess = nativeAuthSessions.get(nativeSessionId);
    if (!natSess) {
      try {
        const dbRow = await db.get<any>('SELECT * FROM native_auth_sessions WHERE id = ?', nativeSessionId);
        if (dbRow) {
          natSess = {
            id: dbRow.id,
            createdAt: new Date(dbRow.created_at).getTime(),
            expiresAt: new Date(dbRow.expires_at).getTime(),
            status: dbRow.status,
            provider: dbRow.provider,
            codeChallenge: dbRow.code_challenge,
            codeChallengeMethod: dbRow.code_challenge_method,
            redirectUri: dbRow.redirect_uri,
            state: dbRow.state,
          };
          nativeAuthSessions.set(nativeSessionId, natSess);
        }
      } catch (_) {}
    }

    const effectiveCodeChallenge = natSess?.codeChallenge || codeChallenge || '';
    const effectiveCodeChallengeMethod = natSess?.codeChallengeMethod || codeChallengeMethod || 'S256';
    const effectiveRedirectUri = natSess?.redirectUri || redirectUri || 'pulsechat://auth/callback';

    const authCode = await createAuthCode(
      userId,
      effectiveCodeChallenge,
      effectiveCodeChallengeMethod,
      effectiveRedirectUri
    );

    const user = await db.get<any>('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?', userId);
    const userProfile = {
      id: user?.id || userId,
      username: user?.username || 'user',
      displayName: user?.display_name || user?.username || 'User',
      avatarUrl: user?.avatar_url || '',
    };

    if (natSess) {
      natSess.status = 'completed';
      natSess.authCode = authCode;
      natSess.user = userProfile;
    }

    try {
      await db.run(
        'UPDATE native_auth_sessions SET status = ?, auth_code = ?, user_id = ?, user_profile = ? WHERE id = ?',
        'completed',
        authCode,
        userId,
        JSON.stringify(userProfile),
        nativeSessionId
      );
    } catch (_) {}

    notifyNativeAuthSuccess(nativeSessionId, {
      code: authCode,
      state: natSess?.state || state || '',
      user: userProfile,
    });

    const deepLink = `pulsechat://auth/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(natSess?.state || state || '')}`;
    const isServerAndroid = Boolean(req.headers['user-agent'] && /Android/i.test(req.headers['user-agent']));

    return res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Вход выполнен · PulseChat</title>
        <style>
          body { margin: 0; background: #090d16; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
          .card { width: 100%; max-width: 440px; padding: 40px 28px; background: #141d33; border: 1px solid rgba(255,255,255,0.1); border-radius: 28px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .icon { width: 68px; height: 68px; margin: 0 auto 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 22px; display: flex; align-items: center; justify-content: center; font-size: 34px; color: #10b981; }
          h2 { margin: 0 0 10px; font-size: 22px; font-weight: 700; color: #fff; }
          p { margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
          .btn-primary { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 15px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 14px; font-weight: 600; font-size: 15px; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4); box-sizing: border-box; border: none; cursor: pointer; transition: background 0.2s; }
          .btn-primary:hover { background: #4f46e5; }
          .btn-secondary { display: inline-flex; align-items: center; justify-content: center; width: 100%; margin-top: 12px; padding: 12px 20px; background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; font-size: 13px; font-weight: 500; cursor: pointer; box-sizing: border-box; }
          .btn-secondary:hover { color: #f8fafc; border-color: rgba(255,255,255,0.2); }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <!-- Desktop View: NO pulsechat:// invocation to prevent Windows system error dialog -->
          <div id="desktop-view" style="${isServerAndroid ? 'display: none;' : 'display: block;'}">
            <h2>Авторизация успешна!</h2>
            <p>Вы уже вошли в приложение PulseChat.<br>Эту вкладку можно закрыть.</p>
            <button type="button" class="btn-primary" onclick="window.close();">Закрыть вкладку</button>
          </div>

          <!-- Android View: deep-link intent return -->
          <div id="android-view" style="${isServerAndroid ? 'display: block;' : 'display: none;'}">
            <h2>Вход подтверждён!</h2>
            <p>Авторизация успешно завершена. Приложение PulseChat должно открыться автоматически.</p>
            <a href="${deepLink}" class="btn-primary">Вернуться в приложение PulseChat</a>
            <button type="button" class="btn-secondary" onclick="window.close();">Закрыть окно</button>
          </div>
        </div>

        <script>
          (function() {
            var isAndroid = /Android/i.test(navigator.userAgent);
            var desktopView = document.getElementById('desktop-view');
            var androidView = document.getElementById('android-view');

            if (isAndroid) {
              if (desktopView) desktopView.style.display = 'none';
              if (androidView) androidView.style.display = 'block';
              try {
                window.location.href = "${deepLink}";
              } catch (e) {}
              setTimeout(function() {
                try { window.close(); } catch (_) {}
              }, 3000);
            } else {
              if (desktopView) desktopView.style.display = 'block';
              if (androidView) androidView.style.display = 'none';
              // Desktop: Do not touch pulsechat:// - desktop polls via WebSocket/HTTP
              setTimeout(function() {
                try { window.close(); } catch (_) {}
              }, 1500);
            }
          })();
        </script>
      </body>
      </html>
    `);
  }

  const targetRedirectUri = redirectUri && isAllowedRedirectUri(redirectUri) ? redirectUri : '';

  if (targetRedirectUri && codeChallenge) {
    // Standard OAuth 2.0 PKCE redirect (Windows/Android app or external web client)
    const code = await createAuthCode(userId, codeChallenge, codeChallengeMethod || 'S256', targetRedirectUri);
    const redirectUrl = new URL(targetRedirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    if (targetRedirectUri.startsWith('pulsechat://') || targetRedirectUri.startsWith('app://')) {
      const deepLink = redirectUrl.toString();
      const isServerAndroid = Boolean(req.headers['user-agent'] && /Android/i.test(req.headers['user-agent']));
      return res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Вход выполнен · PulseChat</title>
          <style>
            body { margin: 0; background: #090d16; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
            .card { width: 100%; max-width: 420px; padding: 36px 28px; background: #141d33; border: 1px solid rgba(255,255,255,0.1); border-radius: 28px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            .icon { width: 64px; height: 64px; margin: 0 auto 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #10b981; }
            h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #fff; }
            p { margin: 0 0 24px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
            .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 14px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 14px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4); box-sizing: border-box; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <!-- Desktop View -->
            <div id="desktop-view" style="${isServerAndroid ? 'display: none;' : 'display: block;'}">
              <h2>Авторизация успешна!</h2>
              <p>Вы уже вошли в приложение PulseChat.<br>Эту вкладку можно закрыть.</p>
              <button type="button" class="btn" onclick="window.close();">Закрыть вкладку</button>
            </div>

            <!-- Android View -->
            <div id="android-view" style="${isServerAndroid ? 'display: block;' : 'display: none;'}">
              <h2>Вход выполнен!</h2>
              <p>Авторизация прошла успешно. Возвращаемся в приложение PulseChat...</p>
              <a href="${deepLink}" class="btn">Открыть приложение PulseChat</a>
            </div>
          </div>

          <script>
            (function() {
              var isAndroid = /Android/i.test(navigator.userAgent);
              var desktopView = document.getElementById('desktop-view');
              var androidView = document.getElementById('android-view');

              if (isAndroid) {
                if (desktopView) desktopView.style.display = 'none';
                if (androidView) androidView.style.display = 'block';
                setTimeout(function() {
                  window.location.href = "${deepLink}";
                }, 250);
              } else {
                if (desktopView) desktopView.style.display = 'block';
                if (androidView) androidView.style.display = 'none';
                setTimeout(function() {
                  try { window.close(); } catch (_) {}
                }, 1500);
              }
            })();
          </script>
        </body>
        </html>
      `);
    }

    return res.redirect(redirectUrl.toString());
  }

  // Web browser login without PKCE: create session and set httpOnly cookie.
  // NEVER put tokens in the URL!
  const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || '';
  const session = await createSession(userId, deviceInfo, ip);

  setRefreshCookie(res, session.refreshToken);
  res.redirect('/?auth=success');
}

// ============================================================================
// 8. OAUTH REDIRECTS (GitHub, Google, Telegram) - ZERO TOKENS IN URL!
// ============================================================================

// Track in-flight provider code exchanges to prevent duplicate POST /token requests (which cause invalid_grant)
const activeCodeExchanges = new Map<string, Promise<any>>();

// --- GITHUB ---
authRouter.get('/github', async (req, res) => {
  const { githubClientId } = getOAuthEnv();
  const { redirect_uri, code_challenge, code_challenge_method, state, native_session } = req.query as any;

  const nativeSessionId =
    (native_session as string) ||
    (state && String(state).startsWith('nat_') ? String(state) : undefined);

  // Persist state in PostgreSQL (survives process restarts and cold boots)
  const stateId = await createOAuthState('github', state, redirect_uri, code_challenge, code_challenge_method, nativeSessionId);

  // Set signed/secure httpOnly cookie as well for dual-channel verification
  res.cookie('pulse_oauth_state', stateId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });

  if (githubClientId) {
    const callbackUri = encodeURIComponent(getCallbackUrl(req, 'github'));
    return res.redirect(
      `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${callbackUri}&scope=read:user%20user:email&state=${stateId}`
    );
  }

  // Local/Dev screen
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Authorize PulseChat · GitHub</title>
      <style>
        body { margin: 0; background: #0d1117; color: #c9d1d9; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; width: 100%; max-width: 440px; padding: 32px; text-align: center; }
        h1 { font-size: 20px; color: #f0f6fc; margin: 0 0 16px; }
        input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #fff; padding: 10px; border-radius: 6px; margin-bottom: 16px; box-sizing: border-box; }
        .btn { width: 100%; background: #238636; border: none; color: #fff; padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Авторизовать PulseChat (GitHub)</h1>
        <form action="/api/auth/github/callback" method="GET">
          <input type="text" name="custom_name" value="romaleks098" placeholder="Ваш GitHub логин">
          <input type="hidden" name="direct_auth" value="true">
          <input type="hidden" name="state" value="${stateId}">
          <button type="submit" class="btn">Войти через GitHub</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

authRouter.get('/github/callback', async (req, res) => {
  const code = req.query.code as string;
  const directAuth = req.query.direct_auth as string;
  const customName = (req.query.custom_name as string) || 'romaleks098';
  const stateParam = req.query.state as string;
  const cookieState = req.cookies?.pulse_oauth_state as string;
  const stateId = stateParam || cookieState;
  const providerError = req.query.error as string;

  if (providerError) {
    console.warn(`[GitHub OAuth] Provider error received: ${providerError}`, req.query.error_description || '');
    if (providerError === 'access_denied') {
      return res.redirect('/?oauth_error=oauth_access_denied');
    }
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  // Retrieve & consume state from DB
  const isDbStateId = typeof stateId === 'string' && /^[a-f0-9]{64}$/i.test(stateId);
  const savedState = isDbStateId ? await consumeOAuthState(stateId, 'github') : null;

  if (isDbStateId && !savedState) {
    console.warn('[GitHub OAuth] OAuth state not found in database or already consumed:', {
      state_id: stateId.slice(0, 8) + '...',
    });
    return res.redirect('/?oauth_error=oauth_state_mismatch');
  }
  if (!isDbStateId && !directAuth) {
    console.warn('[GitHub OAuth] Invalid state parameter received in non-dev mode');
    return res.redirect('/?oauth_error=oauth_state_mismatch');
  }

  res.clearCookie('pulse_oauth_state', {
    httpOnly: true,
    path: '/api/auth',
  });

  const codeChallenge = savedState?.codeChallenge || (req.query.code_challenge as string);
  const codeChallengeMethod = savedState?.codeChallengeMethod || (req.query.code_challenge_method as string) || 'S256';
  const redirectUri = savedState?.redirectUri || (req.query.redirect_uri as string);
  const stateVal = savedState?.clientState || (req.query.state as string);
  const nativeSessionId =
    savedState?.nativeSessionId ||
    (req.query.native_session as string) ||
    (stateVal && String(stateVal).startsWith('nat_') ? String(stateVal) : undefined);

  // Direct Dev Auth flow
  if (directAuth) {
    const cleanUser = customName.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'github_user';
    const userId = await upsertOAuthUser(
      'github',
      `gh_${cleanUser}`,
      cleanUser,
      cleanUser,
      `https://github.com/${cleanUser}.png`
    );
    return completeOAuthRedirect(
      req,
      res,
      userId,
      stateVal,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      nativeSessionId
    );
  }

  const { githubClientId, githubClientSecret, publicUrl } = getOAuthEnv();
  const callbackUri = getCallbackUrl(req, 'github');

  console.log(`[GitHub OAuth] Initiating token exchange:`, {
    has_client_id: Boolean(githubClientId),
    has_client_secret: Boolean(githubClientSecret),
    has_public_url: Boolean(publicUrl),
    redirect_uri: callbackUri,
  });

  if (!code || !githubClientId || !githubClientSecret) {
    console.error('[GitHub OAuth] Missing code or credentials:', {
      has_code: Boolean(code),
      has_client_id: Boolean(githubClientId),
      has_client_secret: Boolean(githubClientSecret),
    });
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  try {
    const exchangeFn = async () => {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code,
          redirect_uri: callbackUri,
        }),
      });
      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;

      if (!tokenRes.ok || !tokenData.access_token) {
        console.error(`[GitHub OAuth] Token exchange failed:`, {
          status: tokenRes.status,
          error: tokenData.error || 'unknown_error',
          error_description: tokenData.error_description || 'No description provided by GitHub',
          redirect_uri_used: callbackUri,
        });
        throw new Error('github_exchange_failed');
      }

      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'PulseChat-App' },
      });
      const ghUser = (await userRes.json().catch(() => ({}))) as any;

      if (!userRes.ok || !ghUser.id) {
        console.error(`[GitHub OAuth] User profile fetch failed:`, {
          status: userRes.status,
        });
        throw new Error('github_profile_failed');
      }

      const userId = await upsertOAuthUser(
        'github',
        String(ghUser.id),
        ghUser.login,
        ghUser.name || ghUser.login,
        ghUser.avatar_url || `https://github.com/${ghUser.login}.png`
      );

      return { userId };
    };

    let exchangePromise = activeCodeExchanges.get(code);
    if (!exchangePromise) {
      exchangePromise = exchangeFn();
      activeCodeExchanges.set(code, exchangePromise);
      exchangePromise.finally(() => {
        setTimeout(() => activeCodeExchanges.delete(code), 30000);
      });
    }

    const { userId } = await exchangePromise;

    return completeOAuthRedirect(
      req,
      res,
      userId,
      stateVal,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      nativeSessionId
    );
  } catch (err: any) {
    console.error('[GitHub OAuth] Internal error:', err.message || err);
    res.redirect('/?oauth_error=oauth_exchange_failed');
  }
});

// --- GOOGLE ---
authRouter.get('/google', async (req, res) => {
  const { googleClientId } = getOAuthEnv();
  const { redirect_uri, code_challenge, code_challenge_method, state, native_session } = req.query as any;

  const nativeSessionId =
    (native_session as string) ||
    (state && String(state).startsWith('nat_') ? String(state) : undefined);

  // Persist state in PostgreSQL (survives process restarts and cold boots)
  const stateId = await createOAuthState('google', state, redirect_uri, code_challenge, code_challenge_method, nativeSessionId);

  // Set signed/secure httpOnly cookie as well for dual-channel verification
  res.cookie('pulse_oauth_state', stateId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });

  if (googleClientId) {
    const callbackUri = encodeURIComponent(getCallbackUrl(req, 'google'));
    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${callbackUri}&response_type=code&scope=openid%20profile%20email&access_type=offline&state=${stateId}`
    );
  }

  // Local/Dev screen
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Вход с помощью аккаунта Google</title>
      <style>
        body { margin: 0; background: #ffffff; color: #1f1f1f; font-family: 'Google Sans', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { width: 100%; max-width: 440px; padding: 40px; border: 1px solid #dadce0; border-radius: 28px; text-align: center; }
        input { width: 100%; border: 1px solid #747775; border-radius: 8px; padding: 12px; margin-bottom: 16px; box-sizing: border-box; }
        .btn { width: 100%; background: #0b57d0; color: #fff; border: none; padding: 12px; border-radius: 100px; font-weight: 500; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Вход с аккаунтом Google</h1>
        <form action="/api/auth/google/callback" method="GET">
          <input type="hidden" name="direct_auth" value="true">
          <input type="hidden" name="state" value="${stateId}">
          <input type="email" name="email" value="romaleks098@gmail.com" placeholder="Ваш Google email..." required>
          <button type="submit" class="btn">Войти с этим аккаунтом</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const directAuth = req.query.direct_auth as string;
  const email = (req.query.email as string) || 'google_user@gmail.com';
  const name = (req.query.name as string) || email.split('@')[0];
  const stateParam = req.query.state as string;
  const cookieState = req.cookies?.pulse_oauth_state as string;
  const stateId = stateParam || cookieState;
  const providerError = req.query.error as string;

  if (providerError) {
    console.warn(`[Google OAuth] Provider error received: ${providerError}`, req.query.error_description || '');
    if (providerError === 'access_denied') {
      return res.redirect('/?oauth_error=oauth_access_denied');
    }
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  // Retrieve & consume state from DB
  const isDbStateId = typeof stateId === 'string' && /^[a-f0-9]{64}$/i.test(stateId);
  const savedState = isDbStateId ? await consumeOAuthState(stateId, 'google') : null;

  if (isDbStateId && !savedState) {
    console.warn('[Google OAuth] OAuth state not found in database or already consumed:', {
      state_id: stateId.slice(0, 8) + '...',
      has_cookie_state: Boolean(cookieState),
    });
    return res.redirect('/?oauth_error=oauth_state_mismatch');
  }
  if (!isDbStateId && !directAuth) {
    console.warn('[Google OAuth] Invalid state parameter received in non-dev mode');
    return res.redirect('/?oauth_error=oauth_state_mismatch');
  }

  res.clearCookie('pulse_oauth_state', {
    httpOnly: true,
    path: '/api/auth',
  });

  const codeChallenge = savedState?.codeChallenge || (req.query.code_challenge as string);
  const codeChallengeMethod = savedState?.codeChallengeMethod || (req.query.code_challenge_method as string) || 'S256';
  const redirectUri = savedState?.redirectUri || (req.query.redirect_uri as string);
  const stateVal = savedState?.clientState || (req.query.state as string);
  const nativeSessionId =
    savedState?.nativeSessionId ||
    (req.query.native_session as string) ||
    (stateVal && String(stateVal).startsWith('nat_') ? String(stateVal) : undefined);

  if (directAuth) {
    const cleanUser = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'google_user';
    const userId = await upsertOAuthUser(
      'google',
      `google_${cleanUser}`,
      cleanUser,
      name,
      `https://api.dicebear.com/7.x/identicon/svg?seed=${cleanUser}`
    );
    return completeOAuthRedirect(
      req,
      res,
      userId,
      stateVal,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      nativeSessionId
    );
  }

  const { googleClientId, googleClientSecret, publicUrl } = getOAuthEnv();
  const callbackUri = getCallbackUrl(req, 'google');

  console.log(`[Google OAuth] Initiating token exchange:`, {
    has_client_id: Boolean(googleClientId),
    has_client_secret: Boolean(googleClientSecret),
    has_public_url: Boolean(publicUrl),
    redirect_uri: callbackUri,
  });

  if (!code || !googleClientId || !googleClientSecret) {
    console.error('[Google OAuth] Missing code or credentials:', {
      has_code: Boolean(code),
      has_client_id: Boolean(googleClientId),
      has_client_secret: Boolean(googleClientSecret),
    });
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  try {
    const exchangeFn = async () => {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: callbackUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = (await tokenRes.json().catch(() => ({}))) as any;

      if (!tokenRes.ok || !tokenData.access_token) {
        console.error(`[Google OAuth] Token exchange failed:`, {
          status: tokenRes.status,
          error: tokenData.error || 'unknown_error',
          error_description: tokenData.error_description || 'No description provided by Google',
          redirect_uri_used: callbackUri,
        });
        throw new Error('google_exchange_failed');
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const gUser = (await profileRes.json().catch(() => ({}))) as any;

      if (!profileRes.ok || !gUser.id) {
        console.error(`[Google OAuth] User profile fetch failed:`, {
          status: profileRes.status,
        });
        throw new Error('google_profile_failed');
      }

      const userId = await upsertOAuthUser(
        'google',
        gUser.id,
        gUser.email ? gUser.email.split('@')[0] : `google_${gUser.id}`,
        gUser.name || 'Google User',
        gUser.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${gUser.id}`
      );

      return { userId };
    };

    // If an exchange is already running for this exact code, reuse its promise to avoid duplicate call & invalid_grant
    let exchangePromise = activeCodeExchanges.get(code);
    if (!exchangePromise) {
      exchangePromise = exchangeFn();
      activeCodeExchanges.set(code, exchangePromise);
      exchangePromise.finally(() => {
        setTimeout(() => activeCodeExchanges.delete(code), 30000);
      });
    }

    const { userId } = await exchangePromise;

    return completeOAuthRedirect(
      req,
      res,
      userId,
      stateVal,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      nativeSessionId
    );
  } catch (err: any) {
    console.error('[Google OAuth] Internal error:', err.message || err);
    res.redirect('/?oauth_error=oauth_exchange_failed');
  }
});

// --- TELEGRAM ---
authRouter.get('/telegram', (req, res) => {
  const { redirect_uri, code_challenge, code_challenge_method, state } = req.query as any;
  const oauthState = JSON.stringify({
    state: state || '',
    redirect_uri: redirect_uri || '',
    code_challenge: code_challenge || '',
    code_challenge_method: code_challenge_method || 'S256',
  });
  const encodedState = Buffer.from(oauthState).toString('base64url');

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Вход через Telegram · PulseChat</title>
      <style>
        body { margin: 0; background: #0f141c; color: #fff; font-family: -apple-system,sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { width: 100%; max-width: 400px; padding: 36px; background: #17212b; border: 1px solid #242f3d; border-radius: 20px; text-align: center; }
        input { width: 100%; background: #0e1621; border: 1px solid #242f3d; color: #fff; padding: 12px; border-radius: 10px; margin-bottom: 14px; box-sizing: border-box; }
        .btn { width: 100%; background: #24a1de; color: #fff; border: none; padding: 13px; border-radius: 12px; font-weight: 600; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Вход через Telegram</h1>
        <form action="/api/auth/telegram/callback" method="GET">
          <input type="text" name="username" value="romaleks098" placeholder="Юзернейм в Telegram" required>
          <input type="text" name="first_name" value="Роман" placeholder="Имя в профиле" required>
          <input type="hidden" name="direct_auth" value="true">
          <input type="hidden" name="state" value="${encodedState}">
          <button type="submit" class="btn">Войти через Telegram</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

authRouter.get('/telegram/callback', async (req, res) => {
  const data = req.query as any;
  const directAuth = data.direct_auth;
  const encodedState = data.state as string;
  const providerError = data.error as string;

  if (providerError) {
    console.warn(`[Telegram OAuth] Provider error received: ${providerError}`);
    if (providerError === 'access_denied') {
      return res.redirect('/?oauth_error=oauth_access_denied');
    }
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  let stateData: any = {};
  if (encodedState) {
    try {
      stateData = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf-8'));
    } catch {
      // Fallback if state is a plain string rather than JSON
      stateData = { state: encodedState };
    }
  }

  const codeChallenge = stateData.code_challenge || (req.query.code_challenge as string);
  const codeChallengeMethod = stateData.code_challenge_method || (req.query.code_challenge_method as string);
  const redirectUri = stateData.redirect_uri || (req.query.redirect_uri as string);
  const stateVal = stateData.state || (req.query.state as string);

  if (directAuth) {
    const cleanUser = (data.username || 'tg_user').replace(/[^a-zA-Z0-9_]/g, '');
    const displayName = data.first_name || cleanUser;
    const userId = await upsertOAuthUser(
      'telegram',
      `tg_${cleanUser}`,
      cleanUser,
      displayName,
      `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${cleanUser}`
    );
    return completeOAuthRedirect(
      req,
      res,
      userId,
      stateVal,
      codeChallenge,
      codeChallengeMethod,
      redirectUri
    );
  }

  const { telegramBotToken } = getOAuthEnv();

  if (!data.id) {
    console.error('[Telegram OAuth] Missing user ID');
    return res.redirect('/?oauth_error=oauth_exchange_failed');
  }

  if (telegramBotToken && data.hash) {
    try {
      const dataCheckArr: string[] = [];
      for (const key of Object.keys(data).sort()) {
        if (key !== 'hash' && key !== 'state') {
          dataCheckArr.push(`${key}=${data[key]}`);
        }
      }
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(telegramBotToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== data.hash) {
        console.error('[Telegram OAuth] Signature hash mismatch');
        return res.redirect('/?oauth_error=oauth_exchange_failed');
      }
    } catch (err: any) {
      console.error('[Telegram OAuth] Signature error:', err.message || err);
      return res.redirect('/?oauth_error=oauth_exchange_failed');
    }
  }

  const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Telegram User';
  const avatarUrl = data.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${data.id}`;

  const userId = await upsertOAuthUser(
    'telegram',
    String(data.id),
    data.username || `tg_${data.id}`,
    displayName,
    avatarUrl
  );

  return completeOAuthRedirect(
    req,
    res,
    userId,
    stateData.state,
    stateData.code_challenge,
    stateData.code_challenge_method,
    stateData.redirect_uri
  );
});

// ============================================================================
// 8.5 TELEGRAM BOT IN-APP AUTH (One-time code + WebSocket confirmation)
// ============================================================================

interface TelegramBotSession {
  token: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'completed' | 'expired';
  codeChallenge?: string;
  codeChallengeMethod?: string;
  redirectUri?: string;
  state?: string;
  authCode?: string;
  userId?: string;
  user?: any;
}

const telegramBotSessions = new Map<string, TelegramBotSession>();

// Cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of telegramBotSessions.entries()) {
    if (sess.expiresAt < now) {
      telegramBotSessions.delete(token);
    }
  }
}, 60 * 1000);

async function sendTelegramMessage(chatId: number | string, text: string, parseMode: string = 'HTML') {
  const { telegramBotToken } = getOAuthEnv();
  if (!telegramBotToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
  } catch (e: any) {
    console.error('Failed to send Telegram message:', e.message || e);
  }
}

function getTelegramWebhookSecret(): string {
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  const { telegramBotToken } = getOAuthEnv();
  const botToken = telegramBotToken || '';
  const jwtSecret = process.env.JWT_SECRET?.trim() || 'pulsechat_tg_secret_salt';
  return crypto.createHmac('sha256', jwtSecret).update(botToken).digest('hex').slice(0, 48);
}

/**
 * Constant-time string comparison to prevent timing attacks on webhook tokens
 */
function safeTimingEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function setupTelegramWebhook() {
  const { telegramBotToken, publicUrl } = getOAuthEnv();
  console.log(`[Telegram Setup] Webhook initialization:`, {
    has_bot_token: Boolean(telegramBotToken),
    has_public_url: Boolean(publicUrl),
    public_url: publicUrl || null,
  });

  if (!telegramBotToken) {
    console.log('[Telegram Setup] No TELEGRAM_BOT_TOKEN provided, skipping bot webhook registration');
    return;
  }

  // 1. Auto-discover bot username from Telegram API getMe
  const botUsername = await fetchTelegramBotUsername();
  if (botUsername) {
    console.log(`[Telegram Setup] Bot identity confirmed: @${botUsername}`);
  }

  // 2. Register webhook if publicUrl is HTTPS
  if (publicUrl && publicUrl.startsWith('https://')) {
    try {
      const webhookUrl = `${publicUrl}/api/auth/telegram/webhook`;
      const secretToken = getTelegramWebhookSecret();
      const resp = await fetch(
        `https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(secretToken)}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`
      );
      const data: any = await resp.json().catch(() => ({}));
      console.log(`[Telegram] Webhook registered at ${webhookUrl} with secret_token:`, data?.ok ? 'OK' : data?.description);
    } catch (e: any) {
      console.error('[Telegram] Failed to register webhook:', e.message || e);
    }
  } else {
    console.warn('[Telegram Setup] Webhook registration skipped because publicUrl is not HTTPS:', publicUrl);
  }
}

// 1. Request a new Telegram bot login session
authRouter.post('/telegram/bot/session', authRateLimiter(20), async (req, res) => {
  const { code_challenge, code_challenge_method, redirect_uri, state } = req.body;
  const token = 'tg_' + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

  telegramBotSessions.set(token, {
    token,
    createdAt: Date.now(),
    expiresAt,
    status: 'pending',
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || 'S256',
    redirectUri: redirect_uri,
    state,
  });

  const { telegramBotToken, telegramBotName } = getOAuthEnv();
  const botUsername = (await fetchTelegramBotUsername()) || telegramBotName || 'PulseChatBot';

  if (!telegramBotToken && !telegramBotName) {
    console.warn('[Telegram] Session created but TELEGRAM_BOT_TOKEN is not configured on server');
  }

  const tgDeepLink = `tg://resolve?domain=${botUsername}&start=${token}`;
  const webDeepLink = `https://t.me/${botUsername}?start=${token}`;

  res.json({
    token,
    botName: botUsername,
    deepLink: tgDeepLink,
    tgDeepLink,
    webDeepLink,
    expiresInSeconds: 300,
  });
});

// 2. Telegram webhook for /start <token> messages and 6-digit /code generation
authRouter.post('/telegram/webhook', async (req, res) => {
  try {
    // Verify Telegram secret token header in constant time to prevent timing attacks
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
    const expectedSecret = getTelegramWebhookSecret();

    if (!incomingSecret || !safeTimingEqual(incomingSecret, expectedSecret)) {
      console.warn('[Telegram Webhook] Unauthorized request rejected: X-Telegram-Bot-Api-Secret-Token mismatch or missing');
      return res.status(403).json({ error: 'Unauthorized webhook' });
    }

    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const text = message.text.trim();
    const match = text.match(/^\/start\s+(tg_[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/i);

    // Check if user requested a 6-digit login code via /code, /login, or clean /start
    const isCodeCommand =
      text === '/code' ||
      text.startsWith('/code') ||
      text === '/login' ||
      text.startsWith('/login') ||
      text === '/start';

    if (!match && isCodeCommand) {
      const { telegramBotToken } = getOAuthEnv();
      const tgUser = message.from;
      if (!tgUser) {
        return res.sendStatus(200);
      }

      // Generate secure 6-digit numeric code e.g. 849201
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Telegram User';
      const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${tgUser.id}`;

      const userId = await upsertOAuthUser(
        'telegram',
        String(tgUser.id),
        tgUser.username || `tg_${tgUser.id}`,
        displayName,
        avatarUrl
      );

      // Save into DB
      try {
        await db.run(`
          INSERT INTO telegram_login_codes (code, user_id, telegram_id, username, display_name, avatar_url, expires_at, used, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        `, code, userId, String(tgUser.id), tgUser.username || `tg_${tgUser.id}`, displayName, avatarUrl, expiresAt, now);
      } catch (err: any) {
        console.error('[Telegram Code] DB save error:', err.message);
      }

      if (telegramBotToken) {
        await sendTelegramMessage(
          message.chat.id,
          `👋 Здравствуйте, <b>${displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>!\n\n` +
          `🔐 Ваш 6-значный код для входа в <b>PulseChat</b>:\n\n` +
          `👉 <code>${code}</code> 👈 <i>(нажмите, чтобы скопировать)</i>\n\n` +
          `📱 Введите этот код в приложении на ПК или телефоне без единого перехода в браузер!\n` +
          `⏳ Код действует 10 минут.`
        );
      }
      return res.sendStatus(200);
    }

    if (!match) {
      const { telegramBotToken } = getOAuthEnv();
      if (telegramBotToken) {
        await sendTelegramMessage(
          message.chat.id,
          '👋 Здравствуйте!\n\nЭтот бот используется для быстрой авторизации в PulseChat.\n\n' +
          'Отправьте команду <b>/code</b>, чтобы получить 6-значный код для входа без браузера!'
        );
      }
      return res.sendStatus(200);
    }

    const token = match[1];
    const session = telegramBotSessions.get(token);
    const { telegramBotToken } = getOAuthEnv();

    if (!session || session.expiresAt < Date.now()) {
      if (telegramBotToken) {
        await sendTelegramMessage(
          message.chat.id,
          '❌ Ссылка для авторизации устарела или недействительна. Пожалуйста, начните вход заново в приложении PulseChat.'
        );
      }
      return res.sendStatus(200);
    }

    const tgUser = message.from;
    if (!tgUser) {
      return res.sendStatus(200);
    }

    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Telegram User';
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${tgUser.id}`;

    const userId = await upsertOAuthUser(
      'telegram',
      String(tgUser.id),
      tgUser.username || `tg_${tgUser.id}`,
      displayName,
      avatarUrl
    );

    const redirectUri = session.redirectUri || 'http://localhost:5173/auth/callback';
    const authCode = await createAuthCode(
      userId,
      session.codeChallenge || '',
      session.codeChallengeMethod || 'S256',
      redirectUri
    );

    const userProfile = {
      id: userId,
      username: tgUser.username || `tg_${tgUser.id}`,
      displayName,
      avatarUrl,
    };

    session.status = 'completed';
    session.authCode = authCode;
    session.userId = userId;
    session.user = userProfile;

    // Send confirmation over WebSocket to the listening client socket
    notifyTelegramAuthSuccess(token, {
      code: authCode,
      state: session.state || '',
      user: userProfile,
    });

    if (telegramBotToken) {
      await sendTelegramMessage(
        message.chat.id,
        '✅ Авторизация в PulseChat успешна! Вы можете вернуться в приложение.'
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.sendStatus(200);
  }
});

// 3. Verify Telegram 6-digit login code
authRouter.post('/telegram/code/verify', authRateLimiter(20), async (req, res) => {
  const { code } = req.body;
  const cleanCode = String(code || '').replace(/\D/g, '').trim();

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: 'Код должен содержать ровно 6 цифр' });
  }

  const now = new Date().toISOString();
  const codeRow = await db.get<any>(`
    SELECT code, user_id, telegram_id, username, display_name, avatar_url, expires_at, used
    FROM telegram_login_codes
    WHERE code = ?
  `, cleanCode);

  if (!codeRow) {
    return res.status(400).json({ error: 'Неверный код. Отправьте /code нашему Telegram-боту, чтобы получить свежий код.' });
  }

  if (codeRow.used === 1 || codeRow.used === true) {
    return res.status(400).json({ error: 'Этот код уже был использован. Запросите новый код у бота командой /code.' });
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Срок действия кода истёк (10 минут). Запросите новый код у бота командой /code.' });
  }

  // Mark as used
  await db.run('UPDATE telegram_login_codes SET used = 1 WHERE code = ?', cleanCode);

  const userId = codeRow.user_id;
  const user = await db.get<any>('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?', userId);
  const userProfile = {
    id: user?.id || userId,
    username: user?.username || codeRow.username,
    displayName: user?.display_name || codeRow.display_name,
    avatarUrl: user?.avatar_url || codeRow.avatar_url,
  };

  const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
  const ip = req.ip || req.socket.remoteAddress || '';
  const session = await createSession(userId, deviceInfo, ip);
  setRefreshCookie(res, session.refreshToken);

  res.json({
    token: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: userProfile,
  });
});

// 4. Fallback / Test endpoint to generate 6-digit Telegram code without live webhook
authRouter.post('/telegram/code/mock-request', authRateLimiter(30), async (req, res) => {
  const { id, username, first_name } = req.body;
  const tgId = id || '12345678';
  const tgUser = username || 'test_user';
  const displayName = first_name || 'Test User';
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${tgId}`;

  const userId = await upsertOAuthUser('telegram', String(tgId), tgUser, displayName, avatarUrl);
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO telegram_login_codes (code, user_id, telegram_id, username, display_name, avatar_url, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `, code, userId, String(tgId), tgUser, displayName, avatarUrl, expiresAt, now);

  res.json({ success: true, code, user: { id: userId, username: tgUser, displayName, avatarUrl } });
});

// 5. Fallback / Test endpoint to confirm Telegram login without live webhook
authRouter.post('/telegram/bot/mock-confirm', authRateLimiter(20), async (req, res) => {
  const { token, id, username, first_name } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  const session = telegramBotSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Сессия устарела или не найдена' });
  }

  const tgId = id || '12345678';
  const tgUser = username || 'test_user';
  const displayName = first_name || 'Test User';
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${tgId}`;

  const userId = await upsertOAuthUser(
    'telegram',
    String(tgId),
    tgUser,
    displayName,
    avatarUrl
  );

  const redirectUri = session.redirectUri || 'http://localhost:5173/auth/callback';
  const authCode = await createAuthCode(
    userId,
    session.codeChallenge || '',
    session.codeChallengeMethod || 'S256',
    redirectUri
  );

  const userProfile = {
    id: userId,
    username: tgUser,
    displayName,
    avatarUrl,
  };

  session.status = 'completed';
  session.authCode = authCode;
  session.userId = userId;
  session.user = userProfile;

  notifyTelegramAuthSuccess(token, {
    code: authCode,
    state: session.state || '',
    user: userProfile,
  });

  res.json({ success: true, code: authCode, user: userProfile });
});

// 6. Poll fallback for client if WebSocket drops
authRouter.get('/telegram/bot/check', async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  const session = telegramBotSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(404).json({ error: 'Сессия не найдена или истекла', status: 'expired' });
  }

  res.json({
    status: session.status,
    code: session.authCode || null,
    user: session.user || null,
  });
});

// ============================================================================
// 9. CURRENT USER PROFILE (/me, /profile)
// ============================================================================
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await db.get<any>(
      'SELECT id, username, display_name, avatar_url, status_text, bio, theme_settings, last_seen, created_at FROM users WHERE id = ?',
      req.user!.userId
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      statusText: user.status_text || '',
      bio: user.bio || '',
      themeSettings: user.theme_settings || '',
      lastSeen: user.last_seen,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.put('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { username, displayName, avatarUrl, statusText, bio, themeSettings } = req.body;

  try {
    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUser.length < 3) {
        return res.status(400).json({ error: 'Имя пользователя должно быть не менее 3 символов' });
      }
      const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', cleanUser, req.user!.userId);
      if (existing) {
        return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      }
      updates.push('username = ?');
      params.push(cleanUser);
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName.trim());
    }
    if (avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatarUrl);
    }
    if (statusText !== undefined) {
      updates.push('status_text = ?');
      params.push(statusText.trim());
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio.trim());
    }
    if (themeSettings !== undefined) {
      updates.push('theme_settings = ?');
      params.push(typeof themeSettings === 'string' ? themeSettings : JSON.stringify(themeSettings));
    }

    if (updates.length > 0) {
      params.push(req.user!.userId);
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...params);
    }

    const updatedUser = await db.get<any>(
      'SELECT id, username, display_name, avatar_url, status_text, bio, theme_settings FROM users WHERE id = ?',
      req.user!.userId
    );
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      avatarUrl: updatedUser.avatar_url,
      statusText: updatedUser.status_text || '',
      bio: updatedUser.bio || '',
      themeSettings: updatedUser.theme_settings || '',
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
