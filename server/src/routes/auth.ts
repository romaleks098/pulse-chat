import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, AuthenticatedRequest } from '../auth.js';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
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
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const finalAvatar = avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;

    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, avatar_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, cleanUsername, displayName.trim(), passwordHash, finalAvatar);

    const token = signToken({ userId, username: cleanUsername });

    res.json({
      token,
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

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername) as any;
    if (!user) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const token = signToken({ userId: user.id, username: user.username });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        statusText: user.status_text,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/social', async (req, res) => {
  const { provider, data } = req.body;
  if (!provider || !data || !data.id) {
    return res.status(400).json({ error: 'Не переданы данные провайдера' });
  }

  const providerId = String(data.id);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Check Telegram signature if bot token is provided
  if (provider === 'telegram' && botToken && data.hash) {
    try {
      const dataCheckArr: string[] = [];
      for (const key of Object.keys(data).sort()) {
        if (key !== 'hash') {
          dataCheckArr.push(`${key}=${data[key]}`);
        }
      }
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(botToken).digest();
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
    // Find existing user by provider and providerId
    let user = db.prepare('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ?').get(provider, providerId) as any;

    if (!user) {
      // Generate clean unique username
      let baseUsername = (data.username || `${provider}_${providerId}`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (baseUsername.length < 3) baseUsername = `${provider}_user`;

      let finalUsername = baseUsername;
      let counter = 1;
      while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(finalUsername)) {
        finalUsername = `${baseUsername}_${counter++}`;
      }

      const userId = crypto.randomUUID();
      const displayName = (data.displayName || data.first_name || finalUsername).trim();
      const avatarUrl = data.avatarUrl || data.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${finalUsername}`;
      // Random secure password hash so social accounts cannot be logged into with a blank password
      const passwordHash = hashPassword(crypto.randomBytes(32).toString('hex'));

      db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, avatar_url, auth_provider, provider_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, finalUsername, displayName, passwordHash, avatarUrl, provider, providerId);

      user = {
        id: userId,
        username: finalUsername,
        display_name: displayName,
        avatar_url: avatarUrl,
        status_text: '',
      };
    }

    const token = signToken({ userId: user.id, username: user.username });

    res.json({
      token,
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

authRouter.get('/providers', (_req, res) => {
  res.json({
    telegramBotName: process.env.TELEGRAM_BOT_NAME || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
  });
});

// Helper for upserting OAuth user and returning token
function upsertOAuthUser(provider: string, providerId: string, usernameBase: string, displayName: string, avatarUrl: string): string {
  let user = db.prepare('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ?').get(provider, providerId) as any;

  if (!user) {
    let cleanUsername = usernameBase.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) cleanUsername = `${provider}_user`;

    let finalUsername = cleanUsername;
    let counter = 1;
    while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(finalUsername)) {
      finalUsername = `${cleanUsername}_${counter++}`;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(crypto.randomBytes(32).toString('hex'));

    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, avatar_url, auth_provider, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, finalUsername, displayName.trim() || finalUsername, passwordHash, avatarUrl, provider, providerId);

    user = { id: userId, username: finalUsername };
  }

  return signToken({ userId: user.id, username: user.username });
}

// -------------------------------------------------------------
// REAL OAUTH 2.0 BROWSER REDIRECT FLOWS
// -------------------------------------------------------------

// 1. GitHub OAuth Redirect
authRouter.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect('/?oauth_config=github');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/github/callback`);

  res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user%20user:email`);
});

authRouter.get('/github/callback', async (req, res) => {
  const code = req.query.code as string;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/?oauth_error=github_failed');
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('No access token');

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'PulseChat-App',
      },
    });
    const ghUser = await userRes.json() as any;

    const token = upsertOAuthUser(
      'github',
      String(ghUser.id),
      ghUser.login,
      ghUser.name || ghUser.login,
      ghUser.avatar_url || `https://github.com/${ghUser.login}.png`
    );

    res.redirect(`/?token=${token}`);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect('/?oauth_error=github_failed');
  }
});

// 2. Google OAuth 2.0 Redirect
authRouter.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.redirect('/?oauth_config=google');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/google/callback`);

  res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20profile%20email&access_type=offline`
  );
});

authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/?oauth_error=google_failed');
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('No Google token');

    // Fetch user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await profileRes.json() as any;

    const token = upsertOAuthUser(
      'google',
      gUser.id,
      gUser.email ? gUser.email.split('@')[0] : `google_${gUser.id}`,
      gUser.name || 'Google User',
      gUser.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${gUser.id}`
    );

    res.redirect(`/?token=${token}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect('/?oauth_error=google_failed');
  }
});

// 3. Telegram Login Widget Callback Redirect
authRouter.get('/telegram/callback', (req, res) => {
  const data = req.query as any;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!data.id) {
    return res.redirect('/?oauth_error=telegram_failed');
  }

  // If bot token is configured, verify HMAC signature
  if (botToken && data.hash) {
    try {
      const dataCheckArr: string[] = [];
      for (const key of Object.keys(data).sort()) {
        if (key !== 'hash') {
          dataCheckArr.push(`${key}=${data[key]}`);
        }
      }
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== data.hash) {
        return res.redirect('/?oauth_error=telegram_invalid_signature');
      }
    } catch (err) {
      return res.redirect('/?oauth_error=telegram_failed');
    }
  }

  const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Telegram User';
  const avatarUrl = data.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${data.id}`;

  const token = upsertOAuthUser(
    'telegram',
    String(data.id),
    data.username || `tg_${data.id}`,
    displayName,
    avatarUrl
  );

  res.redirect(`/?token=${token}`);
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = db.prepare('SELECT id, username, display_name, avatar_url, status_text, last_seen, created_at FROM users WHERE id = ?').get(req.user!.userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      statusText: user.status_text,
      lastSeen: user.last_seen,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { displayName, avatarUrl, statusText } = req.body;

  try {
    const updates: string[] = [];
    const params: any[] = [];

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

    if (updates.length > 0) {
      params.push(req.user!.userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedUser = db.prepare('SELECT id, username, display_name, avatar_url, status_text FROM users WHERE id = ?').get(req.user!.userId) as any;
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      avatarUrl: updatedUser.avatar_url,
      statusText: updatedUser.status_text,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
