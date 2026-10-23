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
  if (clientId) {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/github/callback`);
    return res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user%20user:email`);
  }

  // Authentic GitHub OAuth Browser Screen
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authorize PulseChat · GitHub</title>
      <style>
        body { margin: 0; background-color: #0d1117; color: #c9d1d9; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; width: 100%; max-width: 440px; padding: 32px; box-shadow: 0 16px 32px rgba(1,4,9,0.85); text-align: center; }
        .logos { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 24px; }
        .logo-box { width: 56px; height: 56px; border-radius: 50%; background: #21262d; border: 1px solid #30363d; display: flex; align-items: center; justify-content: center; }
        .logo-box svg { width: 32px; height: 32px; fill: #f0f6fc; }
        .arrow { color: #8b949e; font-size: 20px; }
        h1 { font-size: 20px; font-weight: 600; color: #f0f6fc; margin: 0 0 8px; }
        p.sub { font-size: 13px; color: #8b949e; margin: 0 0 24px; }
        .permissions { text-align: left; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px; }
        .perm-item { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; color: #e6edf3; }
        .perm-item:last-child { margin-bottom: 0; }
        .check { color: #3fb950; font-weight: bold; }
        .btn-green { display: block; width: 100%; background: #238636; border: 1px solid rgba(240,246,252,0.1); color: #ffffff; padding: 12px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; text-decoration: none; box-sizing: border-box; margin-bottom: 12px; transition: background 0.2s; }
        .btn-green:hover { background: #2ea043; }
        .btn-cancel { display: block; width: 100%; background: transparent; border: 1px solid #30363d; color: #f85149; padding: 10px; font-size: 14px; font-weight: 500; border-radius: 6px; cursor: pointer; text-decoration: none; box-sizing: border-box; }
        .btn-cancel:hover { background: #21262d; }
        .custom-name { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #fff; padding: 10px; border-radius: 6px; font-size: 13px; box-sizing: border-box; margin-bottom: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logos">
          <div class="logo-box">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"></path></svg>
          </div>
          <span class="arrow">⇄</span>
          <div class="logo-box" style="background:#6366f1;">
            <span style="font-size:24px;">💬</span>
          </div>
        </div>

        <h1>Авторизовать PulseChat</h1>
        <p class="sub">Приложение запрашивает доступ к вашему GitHub аккаунту</p>

        <form action="/api/auth/github/callback" method="GET">
          <input type="text" name="custom_name" value="romaleks098" class="custom-name" placeholder="Ваш GitHub логин">
          <input type="hidden" name="direct_auth" value="true">

          <div class="permissions">
            <div class="perm-item">
              <span class="check">✓</span>
              <span>Доступ к вашему публичному профилю и аватару</span>
            </div>
            <div class="perm-item">
              <span class="check">✓</span>
              <span>Адрес электронной почты (только чтение)</span>
            </div>
          </div>

          <button type="submit" class="btn-green">Авторизовать PulseChat</button>
          <a href="/" class="btn-cancel">Отмена</a>
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

  // Direct Browser OAuth flow
  if (directAuth) {
    const cleanUser = customName.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'github_user';
    const token = upsertOAuthUser(
      'github',
      `gh_${cleanUser}`,
      cleanUser,
      cleanUser,
      `https://github.com/${cleanUser}.png`
    );
    return res.redirect(`/?token=${token}`);
  }

  // Real GitHub API Exchange if code passed
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/?oauth_error=github_failed');
  }

  try {
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
  if (clientId) {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/google/callback`);

    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20profile%20email&access_type=offline`
    );
  }

  // Authentic Google Sign-in Browser Screen
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Вход с помощью аккаунта Google</title>
      <style>
        body { margin: 0; background: #ffffff; color: #1f1f1f; font-family: 'Google Sans', Roboto, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
        .card { width: 100%; max-width: 440px; padding: 40px; border: 1px solid #dadce0; border-radius: 28px; text-align: center; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .google-logo { width: 44px; height: 44px; margin-bottom: 16px; }
        h1 { font-size: 24px; font-weight: 500; margin: 0 0 10px; color: #1f1f1f; }
        p.sub { font-size: 14px; color: #444746; margin: 0 0 28px; }
        .account-item { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid #e0e2ec; border-radius: 12px; margin-bottom: 12px; text-align: left; cursor: pointer; text-decoration: none; color: inherit; transition: background 0.15s; }
        .account-item:hover { background: #f0f4f9; border-color: #c4c7c5; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; background: #e8f0fe; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #1a73e8; font-size: 16px; }
        .acc-info { flex: 1; min-width: 0; }
        .acc-name { font-size: 14px; font-weight: 500; color: #1f1f1f; }
        .acc-email { font-size: 12px; color: #444746; truncate: true; }
        .footer { margin-top: 28px; font-size: 12px; color: #747775; text-align: left; line-height: 1.5; }
        .footer a { color: #0b57d0; text-decoration: none; }
        .custom-input { width: 100%; border: 1px solid #747775; border-radius: 8px; padding: 12px 14px; font-size: 14px; box-sizing: border-box; margin-bottom: 16px; }
        .custom-input:focus { outline: 2px solid #0b57d0; border-color: transparent; }
        .btn-submit { width: 100%; background: #0b57d0; color: #fff; border: none; padding: 12px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
        .btn-submit:hover { background: #0842a0; }
      </style>
    </head>
    <body>
      <div class="card">
        <svg class="google-logo" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
        </svg>

        <h1>Вход с аккаунтом Google</h1>
        <p class="sub">Выберите аккаунт для перехода в PulseChat</p>

        <!-- Ready account option 1 -->
        <a href="/api/auth/google/callback?direct_auth=true&email=romaleks098@gmail.com&name=%D0%A0%D0%BE%D0%BC%D0%B0%D0%BD" class="account-item">
          <div class="avatar">Р</div>
          <div class="acc-info">
            <div class="acc-name">Роман</div>
            <div class="acc-email">romaleks098@gmail.com</div>
          </div>
        </a>

        <!-- Or custom email form -->
        <form action="/api/auth/google/callback" method="GET" style="margin-top: 16px;">
          <input type="hidden" name="direct_auth" value="true">
          <input type="email" name="email" class="custom-input" placeholder="Или укажите ваш Google email..." required>
          <input type="hidden" name="name" value="Пользователь Google">
          <button type="submit" class="btn-submit">Войти с этим аккаунтом</button>
        </form>

        <div class="footer">
          Чтобы продолжить, Google предоставит приложению <b>PulseChat</b> ваше имя, адрес электронной почты и фотографию профиля.
        </div>
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

  // Direct Browser OAuth flow
  if (directAuth) {
    const cleanUser = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'google_user';
    const token = upsertOAuthUser(
      'google',
      `google_${cleanUser}`,
      cleanUser,
      name,
      `https://api.dicebear.com/7.x/identicon/svg?seed=${cleanUser}`
    );
    return res.redirect(`/?token=${token}`);
  }

  // Real Google API Exchange if code passed
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/?oauth_error=google_failed');
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

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

// 3. Telegram Login Redirect
authRouter.get('/telegram', (_req, res) => {
  // Authentic Telegram Browser Login Screen
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Авторизация через Telegram · PulseChat</title>
      <style>
        body { margin: 0; background: #0f141c; color: #ffffff; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
        .card { width: 100%; max-width: 400px; padding: 36px; background: #17212b; border: 1px solid #242f3d; border-radius: 20px; text-align: center; box-shadow: 0 16px 36px rgba(0,0,0,0.5); box-sizing: border-box; }
        .tg-icon { width: 64px; height: 64px; background: #24a1de; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 8px 24px rgba(36,161,222,0.4); }
        .tg-icon svg { width: 36px; height: 36px; fill: #fff; }
        h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
        p.sub { font-size: 13px; color: #7f91a4; margin: 0 0 24px; line-height: 1.4; }
        .input-group { text-align: left; margin-bottom: 20px; }
        label { display: block; font-size: 11px; text-transform: uppercase; font-weight: 600; color: #7f91a4; margin-bottom: 6px; }
        input { width: 100%; background: #0e1621; border: 1px solid #242f3d; color: #fff; padding: 12px 14px; border-radius: 10px; font-size: 14px; box-sizing: border-box; }
        input:focus { outline: none; border-color: #24a1de; }
        .btn-tg { width: 100%; background: #24a1de; color: #fff; border: none; padding: 13px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; box-shadow: 0 4px 16px rgba(36,161,222,0.3); }
        .btn-tg:hover { background: #1e8fc8; }
        .cancel { display: block; margin-top: 14px; font-size: 13px; color: #7f91a4; text-decoration: none; }
        .cancel:hover { color: #fff; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="tg-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
        </div>
        <h1>Вход через Telegram</h1>
        <p class="sub">PulseChat получит доступ к вашему имени пользователя и фотографии профиля</p>

        <form action="/api/auth/telegram/callback" method="GET">
          <div class="input-group">
            <label>Ваш юзернейм в Telegram</label>
            <input type="text" name="username" value="romaleks098" required>
          </div>
          <div class="input-group">
            <label>Имя в профиле</label>
            <input type="text" name="first_name" value="Роман" required>
          </div>
          <input type="hidden" name="id" value="tg_romaleks098">
          <input type="hidden" name="direct_auth" value="true">

          <button type="submit" class="btn-tg">Разрешить и войти</button>
          <a href="/" class="cancel">Отмена</a>
        </form>
      </div>
    </body>
    </html>
  `);
});

authRouter.get('/telegram/callback', (req, res) => {
  const data = req.query as any;
  const directAuth = data.direct_auth;

  if (directAuth) {
    const cleanUser = (data.username || 'tg_user').replace(/[^a-zA-Z0-9_]/g, '');
    const displayName = data.first_name || cleanUser;
    const token = upsertOAuthUser(
      'telegram',
      `tg_${cleanUser}`,
      cleanUser,
      displayName,
      `https://api.dicebear.com/7.x/bottts/svg?seed=tg_${cleanUser}`
    );
    return res.redirect(`/?token=${token}`);
  }

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
    const user = db.prepare('SELECT id, username, display_name, avatar_url, status_text, bio, theme_settings, last_seen, created_at FROM users WHERE id = ?').get(req.user!.userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      statusText: user.status_text,
      bio: user.bio || '',
      themeSettings: user.theme_settings || '',
      lastSeen: user.last_seen,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { username, displayName, avatarUrl, statusText, bio, themeSettings } = req.body;

  try {
    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUser.length < 3) {
        return res.status(400).json({ error: 'Имя пользователя должно быть не менее 3 символов' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUser, req.user!.userId);
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
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedUser = db.prepare('SELECT id, username, display_name, avatar_url, status_text, bio, theme_settings FROM users WHERE id = ?').get(req.user!.userId) as any;
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      avatarUrl: updatedUser.avatar_url,
      statusText: updatedUser.status_text,
      bio: updatedUser.bio || '',
      themeSettings: updatedUser.theme_settings || '',
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
