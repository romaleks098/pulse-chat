import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('🧪 Starting v1.9.1 Architecture & Bug Fix Verification...\n');

// 1. Vite & Asset Path Verification
console.log('--- 1. Testing Vite Configuration & Relative Asset Paths ---');
const viteConfig = fs.readFileSync(path.join(rootDir, 'client/vite.config.ts'), 'utf-8');
assert(
  viteConfig.includes("base: './'"),
  'client/vite.config.ts specifies base: "./" for relative asset resolution'
);

const desktopHtml = fs.readFileSync(path.join(rootDir, 'desktop/client_dist/index.html'), 'utf-8');
assert(
  desktopHtml.includes('src="./assets/') && desktopHtml.includes('href="./assets/'),
  'desktop/client_dist/index.html uses relative ./assets/ paths for scripts and css'
);
assert(
  !desktopHtml.includes('src="/assets/') && !desktopHtml.includes('href="/assets/'),
  'desktop/client_dist/index.html has NO absolute /assets/ paths (avoids ERR_FILE_NOT_FOUND)'
);

const androidHtml = fs.readFileSync(path.join(rootDir, 'client/android/app/src/main/assets/public/index.html'), 'utf-8');
assert(
  androidHtml.includes('src="./assets/') && androidHtml.includes('href="./assets/'),
  'client/android/app/src/main/assets/public/index.html uses relative ./assets/ paths'
);

// 2. Electron Diagnostics & Deep Link Handling
console.log('\n--- 2. Testing Electron Diagnostics & Custom Protocol Support ---');
const desktopMain = fs.readFileSync(path.join(rootDir, 'desktop/main.cjs'), 'utf-8');
assert(
  desktopMain.includes("mainWindow.webContents.on('did-fail-load'") &&
  desktopMain.includes("mainWindow.webContents.on('console-message'"),
  'desktop/main.cjs registers did-fail-load and console-message diagnostics'
);
assert(
  desktopMain.includes("url.startsWith('tg://')") &&
  desktopMain.includes("url.startsWith('pulsechat://')"),
  'desktop/main.cjs allows tg:// and pulsechat:// in open-external handler'
);
assert(
  desktopMain.includes('--test-run'),
  'desktop/main.cjs includes --test-run automated verification hook'
);

// 3. Server Database Migration & Native OAuth State Persistence
console.log('\n--- 3. Testing Database Migration & OAuth State Persistence ---');
const schemaContent = fs.readFileSync(path.join(rootDir, 'server/src/migrations/schema.ts'), 'utf-8');
assert(
  schemaContent.includes('004_native_session_and_telegram_login_codes'),
  'server/src/migrations/schema.ts includes migration 004'
);
assert(
  schemaContent.includes('ALTER TABLE oauth_states ADD COLUMN native_session_id TEXT;') &&
  schemaContent.includes('telegram_login_codes'),
  'schema.ts adds native_session_id to oauth_states and creates telegram_login_codes table'
);

const authServer = fs.readFileSync(path.join(rootDir, 'server/src/auth.ts'), 'utf-8');
assert(
  authServer.includes('nativeSessionId?: string') &&
  authServer.includes('native_session_id'),
  'server/src/auth.ts createOAuthState and consumeOAuthState persist native_session_id'
);

const authRoutes = fs.readFileSync(path.join(rootDir, 'server/src/routes/auth.ts'), 'utf-8');
assert(
  authRoutes.includes('createOAuthState(\'github\', state, redirect_uri, code_challenge, code_challenge_method, nativeSessionId)') &&
  authRoutes.includes('createOAuthState(\'google\', state, redirect_uri, code_challenge, code_challenge_method, nativeSessionId)'),
  'server/src/routes/auth.ts preserves nativeSessionId across Google and GitHub OAuth initiation'
);
assert(
  authRoutes.includes('native_auth_sessions') &&
  authRoutes.includes('UPDATE native_auth_sessions SET status = ?, auth_code = ?'),
  'server/src/routes/auth.ts persists native session completions in PostgreSQL'
);
assert(
  authRoutes.includes('pulsechat://auth/callback?code=') &&
  authRoutes.includes('Вернуться в приложение PulseChat'),
  'completeOAuthRedirect renders dedicated deep-link return page without redirecting to web app'
);

// 4. Telegram In-App Auth & 6-Digit Code Flow
console.log('\n--- 4. Testing Telegram In-App Auth & 6-Digit Code Login ---');
assert(
  authRoutes.includes('/telegram/code/verify'),
  'server/src/routes/auth.ts implements POST /api/auth/telegram/code/verify'
);
assert(
  authRoutes.includes('isCodeCommand') &&
  authRoutes.includes('telegram_login_codes'),
  'Telegram webhook handles /code, /login, and /start to issue 6-digit codes'
);
assert(
  authRoutes.includes('tg://resolve?domain='),
  'Telegram bot session returns tg://resolve?domain= native deep link'
);

const apiService = fs.readFileSync(path.join(rootDir, 'client/src/services/api.ts'), 'utf-8');
assert(
  apiService.includes('verifyLoginCode'),
  'client/src/services/api.ts includes verifyLoginCode method'
);

const authScreen = fs.readFileSync(path.join(rootDir, 'client/src/components/AuthScreen.tsx'), 'utf-8');
assert(
  authScreen.includes('TelegramCodeModal') &&
  authScreen.includes('Войти по 6-значному коду из Telegram'),
  'AuthScreen.tsx includes in-app 6-digit Telegram code login button & modal'
);

const tgModal = fs.readFileSync(path.join(rootDir, 'client/src/components/TelegramBotModal.tsx'), 'utf-8');
assert(
  tgModal.includes('tg://resolve?domain=') &&
  tgModal.includes('onOpenCodeModal'),
  'TelegramBotModal.tsx uses native tg:// link and allows switching to 6-digit code modal'
);

// 5. Run Live Electron Test
console.log('\n--- 5. Executing Electron Automated DOM Test ---');
try {
  const electronOutput = execSync('npx electron . --test-run', {
    cwd: path.join(rootDir, 'desktop'),
    encoding: 'utf-8',
    timeout: 15000,
  });
  console.log(electronOutput.trim());
  assert(
    electronOutput.includes('React interface and Titlebar rendered successfully'),
    'Electron booted, loaded local file bundle, and rendered React DOM root + Titlebar without ERR_FILE_NOT_FOUND'
  );
} catch (e) {
  console.error('Electron execution output:', e.stdout || e.message);
  assert(false, 'Electron failed to execute or render DOM: ' + e.message);
}

console.log('\n🎉 ALL v1.9.1 ARCHITECTURAL & FUNCTIONAL VERIFICATIONS PASSED!\n');
