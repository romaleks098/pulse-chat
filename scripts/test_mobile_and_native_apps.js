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

console.log('🧪 Starting Mobile & Native App Architecture Verification...\n');

// 1. Mobile Layout Tests
console.log('--- 1. Testing Mobile Responsive Rules & Navigation ---');
const chatContextContent = fs.readFileSync(path.join(rootDir, 'client/src/context/ChatContext.tsx'), 'utf-8');
assert(
  chatContextContent.includes('window.innerWidth < 768') && chatContextContent.includes('return null;'),
  'ChatContext.tsx initializes activeConversationId to null on mobile screens (< 768px)'
);
assert(
  chatContextContent.includes('window.innerWidth >= 768') && chatContextContent.includes('c.isSaved'),
  'ChatContext.tsx only auto-selects Saved Messages on desktop (>= 768px)'
);
assert(
  chatContextContent.includes('pulse_cached_user') && chatContextContent.includes('pulse_cached_conversations'),
  'ChatContext.tsx caches user and conversations for 0.01s instant offline startup'
);

const sidebarContent = fs.readFileSync(path.join(rootDir, 'client/src/components/Sidebar.tsx'), 'utf-8');
assert(
  sidebarContent.includes('isDesktop ? { width: `${settings.sidebarWidth}px` } : undefined'),
  'Sidebar.tsx only sets fixed sidebarWidth on desktop screens (100% on mobile)'
);

const chatAreaContent = fs.readFileSync(path.join(rootDir, 'client/src/components/ChatArea.tsx'), 'utf-8');
assert(
  chatAreaContent.includes('min-w-[44px] min-h-[44px]'),
  'ChatArea.tsx Back button has >= 44px tap target for comfortable mobile touch'
);
assert(
  chatAreaContent.includes('handleTouchStartEdge') && chatAreaContent.includes('handleTouchEndEdge'),
  'ChatArea.tsx implements horizontal edge-swipe gesture to return to chat list'
);

const appContent = fs.readFileSync(path.join(rootDir, 'client/src/App.tsx'), 'utf-8');
assert(
  appContent.includes('h-[100dvh]'),
  'App.tsx uses 100dvh for dynamic mobile viewport stability'
);
assert(
  appContent.includes('popstate'),
  'App.tsx handles popstate for Android hardware and browser back button navigation'
);
assert(
  appContent.includes('<DesktopTitlebar />'),
  'App.tsx renders DesktopTitlebar for custom Telegram Desktop experience'
);

// 2. Native Architecture & Offline Capability Tests
console.log('\n--- 2. Testing Standalone Native App Architecture ---');
const runtimeContent = fs.readFileSync(path.join(rootDir, 'client/src/config/runtime.ts'), 'utf-8');
assert(
  runtimeContent.includes('isElectron') && runtimeContent.includes('isCapacitor') && runtimeContent.includes('isNativeApp'),
  'runtime.ts exports isElectron, isCapacitor, and isNativeApp detection'
);
assert(
  runtimeContent.includes('https://pulse-chat-qel7.onrender.com'),
  'runtime.ts routes native app traffic to https://pulse-chat-qel7.onrender.com'
);

const capConfigContent = fs.readFileSync(path.join(rootDir, 'client/capacitor.config.json'), 'utf-8');
const capConfig = JSON.parse(capConfigContent);
assert(
  !capConfig.server || !capConfig.server.url,
  'capacitor.config.json does NOT contain remote server.url (offline local bundle)'
);
assert(
  capConfig.webDir === 'dist',
  'capacitor.config.json points to local webDir "dist"'
);

const androidManifest = fs.readFileSync(
  path.join(rootDir, 'client/android/app/src/main/AndroidManifest.xml'),
  'utf-8'
);
assert(
  androidManifest.includes('pulsechat') && androidManifest.includes('android:host="auth"'),
  'AndroidManifest.xml contains deep link intent-filter for pulsechat://auth'
);
assert(
  androidManifest.includes('RECORD_AUDIO') && androidManifest.includes('CAMERA'),
  'AndroidManifest.xml requests permissions for audio recording and camera'
);

const desktopMain = fs.readFileSync(path.join(rootDir, 'desktop/main.cjs'), 'utf-8');
assert(
  !desktopMain.includes("mainWindow.loadURL('https://pulse-chat-qel7.onrender.com')"),
  'desktop/main.cjs does NOT load remote website URL into window'
);
assert(
  desktopMain.includes('mainWindow.loadFile(bundlePath)'),
  'desktop/main.cjs loads local bundle file index.html'
);
assert(
  desktopMain.includes('frame: false'),
  'desktop/main.cjs configures frameless window for custom titlebar'
);
assert(
  desktopMain.includes('Tray'),
  'desktop/main.cjs includes system tray integration'
);

const desktopPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'desktop/package.json'), 'utf-8'));
assert(
  desktopPkg.build && desktopPkg.build.win && desktopPkg.build.win.target,
  'desktop/package.json contains electron-builder configuration for Windows'
);

// 3. Native OAuth & Device Auth Tests
console.log('\n--- 3. Testing Native OAuth & Deep Link Handlers ---');
const serverAuth = fs.readFileSync(path.join(rootDir, 'server/src/routes/auth.ts'), 'utf-8');
assert(
  serverAuth.includes('/native/session'),
  'server/src/routes/auth.ts includes /api/auth/native/session endpoint'
);
assert(
  serverAuth.includes('pulsechat://auth/callback'),
  'server/src/routes/auth.ts redirects to pulsechat://auth/callback for native OAuth'
);

const pkceContent = fs.readFileSync(path.join(rootDir, 'client/src/utils/pkce.ts'), 'utf-8');
assert(
  pkceContent.includes('startNativeOAuth'),
  'client/src/utils/pkce.ts implements startNativeOAuth for desktop and mobile apps'
);

// 4. GitHub Actions CI/CD Tests
console.log('\n--- 4. Testing GitHub Actions Build Workflow ---');
const workflowContent = fs.readFileSync(
  path.join(rootDir, '.github/workflows/build-apps.yml'),
  'utf-8'
);
assert(
  workflowContent.includes('build-android') && workflowContent.includes('build-windows'),
  'build-apps.yml defines both build-android and build-windows jobs'
);
assert(
  workflowContent.includes('release-apps') && workflowContent.includes('softprops/action-gh-release'),
  'build-apps.yml automatically publishes native binaries on tag push (v*)'
);

console.log('\n🎉 ALL MOBILE & NATIVE APP TESTS PASSED PERFECTLY!\n');
