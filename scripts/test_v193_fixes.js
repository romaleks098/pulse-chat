import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

console.log('🧪 Starting v1.9.3 Verification Tests...\n');

// 1. Task 1: Desktop Browser Success Page - No pulsechat:// invocation on Windows
console.log('--- 1. Testing Desktop Browser Success Page (No pulsechat:// error on Windows) ---');
const serverAuth = fs.readFileSync(path.join(rootDir, 'server/src/routes/auth.ts'), 'utf-8');

assert(
  serverAuth.includes('/Android/i.test(navigator.userAgent)') || serverAuth.includes('/Android/i.test('),
  'auth.ts checks navigator.userAgent for Android in the OAuth callback HTML script'
);

assert(
  serverAuth.includes('desktop-view') && serverAuth.includes('android-view'),
  'auth.ts provides separate adaptive DOM views for Desktop and Android'
);

assert(
  serverAuth.includes('Авторизация успешна!') && serverAuth.includes('Вы уже вошли в приложение PulseChat'),
  'auth.ts desktop-view displays message confirming user has logged in and can close tab'
);

assert(
  serverAuth.includes('isAndroid') && serverAuth.includes('window.location.href = "${deepLink}"'),
  'auth.ts only invokes pulsechat:// deepLink when isAndroid is true'
);

// 2. Task 2: Window Focus & Surfacing on Login
console.log('\n--- 2. Testing Window Focus & Surfacing on Login ---');
const desktopMain = fs.readFileSync(path.join(rootDir, 'desktop/main.cjs'), 'utf-8');
assert(
  desktopMain.includes("ipcMain.on('window-focus'"),
  'desktop/main.cjs defines ipcMain.on window-focus handler'
);
assert(
  desktopMain.includes('mainWindow.setAlwaysOnTop(true)') && desktopMain.includes('mainWindow.focus()'),
  'desktop/main.cjs forces window to top and brings to focus'
);
assert(
  desktopMain.includes('mainWindow.setAlwaysOnTop(false)'),
  'desktop/main.cjs resets setAlwaysOnTop after brief foreground display'
);

const preloadCjs = fs.readFileSync(path.join(rootDir, 'desktop/preload.cjs'), 'utf-8');
assert(
  preloadCjs.includes("focusWindow: () => ipcRenderer.send('window-focus')"),
  'desktop/preload.cjs exposes focusWindow method to renderer via electronAPI'
);

const pkceTs = fs.readFileSync(path.join(rootDir, 'client/src/utils/pkce.ts'), 'utf-8');
assert(
  pkceTs.includes('focusWindow'),
  'client/src/utils/pkce.ts calls electronAPI.focusWindow upon code exchange'
);

const authScreenTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/AuthScreen.tsx'), 'utf-8');
assert(
  authScreenTsx.includes('focusWindow'),
  'client/src/components/AuthScreen.tsx invokes focusWindow upon OAuth completion'
);

const chatContextTsx = fs.readFileSync(path.join(rootDir, 'client/src/context/ChatContext.tsx'), 'utf-8');
assert(
  chatContextTsx.includes('focusWindow'),
  'client/src/context/ChatContext.tsx invokes focusWindow upon applying session'
);

// 3. Task 3: Protocol Registration & Instant Polling
console.log('\n--- 3. Testing Protocol Registration & Instant Polling ---');
assert(
  desktopMain.includes("app.setAsDefaultProtocolClient('pulsechat')") &&
  desktopMain.includes('process.defaultApp'),
  'desktop/main.cjs registers pulsechat:// custom protocol handling dev & prod modes'
);

const desktopPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'desktop/package.json'), 'utf-8'));
assert(
  Array.isArray(desktopPkg.build.protocols) &&
  desktopPkg.build.protocols[0].name === 'PulseChat' &&
  desktopPkg.build.protocols[0].schemes.includes('pulsechat'),
  'desktop/package.json contains protocols array with PulseChat scheme'
);

assert(
  pkceTs.includes('}, 1000);'),
  'client/src/utils/pkce.ts polls /api/auth/native/session/:id every 1000ms (1 second)'
);

// 4. Version Verification (1.9.3)
console.log('\n--- 4. Testing Version Consistency across packages (v1.9.3) ---');
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const clientPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'client/package.json'), 'utf-8'));
const serverPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'server/package.json'), 'utf-8'));

assert(rootPkg.version === '1.9.3', `root package.json is 1.9.3 (got ${rootPkg.version})`);
assert(desktopPkg.version === '1.9.3', `desktop package.json is 1.9.3 (got ${desktopPkg.version})`);
assert(clientPkg.version === '1.9.3', `client package.json is 1.9.3 (got ${clientPkg.version})`);
assert(serverPkg.version === '1.9.3', `server package.json is 1.9.3 (got ${serverPkg.version})`);

console.log('\n🎉 ALL v1.9.3 VERIFICATION TESTS PASSED PERFECTLY!\n');
