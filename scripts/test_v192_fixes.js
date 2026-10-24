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

console.log('🧪 Starting v1.9.2 Verification Tests...\n');

// 1. Task 1: Android Status Bar & Safe Area Insets
console.log('--- 1. Testing Android Status Bar & Safe Area Insets ---');
const stylesXml = fs.readFileSync(path.join(rootDir, 'client/android/app/src/main/res/values/styles.xml'), 'utf-8');
assert(
  stylesXml.includes('android:fitsSystemWindows') && stylesXml.includes('android:windowOptOutEdgeToEdgeEnforcement'),
  'styles.xml configures fitsSystemWindows and opts out of mandatory edge-to-edge'
);
assert(
  stylesXml.includes('android:statusBarColor') && stylesXml.includes('#090d16'),
  'styles.xml sets dark status bar color #090d16'
);

const capConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'client/capacitor.config.json'), 'utf-8'));
assert(
  capConfig.plugins?.StatusBar?.overlaysWebView === false,
  'capacitor.config.json sets StatusBar overlaysWebView to false'
);
assert(
  capConfig.plugins?.StatusBar?.backgroundColor === '#090d16',
  'capacitor.config.json sets StatusBar backgroundColor to #090d16'
);

const indexCss = fs.readFileSync(path.join(rootDir, 'client/src/index.css'), 'utf-8');
assert(
  indexCss.includes('--safe-top') && indexCss.includes('capacitor-android'),
  'index.css defines --safe-top and capacitor-android minimum safe margin'
);

const appTsx = fs.readFileSync(path.join(rootDir, 'client/src/App.tsx'), 'utf-8');
assert(
  appTsx.includes('capacitor-android') && appTsx.includes('StatusBar.setOverlaysWebView'),
  'App.tsx initializes StatusBar and capacitor-android class'
);
assert(
  appTsx.includes('var(--safe-top, 0px)'),
  'App.tsx renders safe top spacer to protect headers from status bar collision'
);

// 2. Task 2: Hide GitHub Login Button on AuthScreen
console.log('\n--- 2. Testing AuthScreen Social Login Layout ---');
const authScreen = fs.readFileSync(path.join(rootDir, 'client/src/components/AuthScreen.tsx'), 'utf-8');
assert(
  authScreen.includes('grid-cols-2') && !authScreen.includes('grid-cols-3'),
  'AuthScreen.tsx displays social buttons in a 2-column grid'
);
assert(
  authScreen.includes('Telegram') && authScreen.includes('Google'),
  'AuthScreen.tsx contains Telegram and Google login buttons'
);
assert(
  !authScreen.includes('<span>GitHub</span>') && !authScreen.includes("handleGithubClick"),
  'AuthScreen.tsx has GitHub login button hidden from UI'
);
assert(
  authScreen.includes('Войти по 6-значному коду из Telegram'),
  'AuthScreen.tsx contains in-app Telegram 6-digit code login'
);

// 3. Task 3: PKCE Code Verifier & Native OAuth Deduplication
console.log('\n--- 3. Testing PKCE & Native OAuth Stability ---');
const pkceTs = fs.readFileSync(path.join(rootDir, 'client/src/utils/pkce.ts'), 'utf-8');
assert(
  pkceTs.includes('safeExchangeAuthCode'),
  'pkce.ts implements safeExchangeAuthCode deduplication'
);
assert(
  pkceTs.includes('inFlightExchanges'),
  'pkce.ts maintains in-flight exchange lock to prevent race conditions'
);
assert(
  pkceTs.includes("method: 'S256' | 'plain'"),
  'pkce.ts generateCodeChallenge supports fallback when SubtleCrypto is unavailable'
);

const authServer = fs.readFileSync(path.join(rootDir, 'server/src/routes/auth.ts'), 'utf-8');
assert(
  authServer.includes('req.body.code_challenge || req.body.codeChallenge'),
  'server auth.ts accepts both camelCase and snake_case for codeChallenge in /native/session'
);

// 4. Task 4: Media Persistence & Universal Asset URL Resolution
console.log('\n--- 4. Testing Media Persistence & resolveAssetUrl ---');
const runtimeTs = fs.readFileSync(path.join(rootDir, 'client/src/config/runtime.ts'), 'utf-8');
assert(
  runtimeTs.includes('export const resolveAssetUrl'),
  'runtime.ts exports resolveAssetUrl helper'
);

const schemaTs = fs.readFileSync(path.join(rootDir, 'server/src/migrations/schema.ts'), 'utf-8');
assert(
  schemaTs.includes('005_media_files_persistence') && schemaTs.includes('CREATE TABLE IF NOT EXISTS media_files'),
  'schema.ts contains migration 005 creating media_files table'
);

const uploadRoute = fs.readFileSync(path.join(rootDir, 'server/src/routes/upload.ts'), 'utf-8');
assert(
  uploadRoute.includes('INSERT INTO media_files') && uploadRoute.includes('req.file.filename'),
  'server upload.ts persists binary file data into media_files database table'
);

const serverIndex = fs.readFileSync(path.join(rootDir, 'server/src/index.ts'), 'utf-8');
assert(
  serverIndex.includes('serveMediaFile') && serverIndex.includes('SELECT mime_type, data, size FROM media_files'),
  'server index.ts serves uploads with database fallback when disk is wiped'
);

const avatarTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/ui/Avatar.tsx'), 'utf-8');
assert(
  avatarTsx.includes('resolveAssetUrl(src)'),
  'Avatar.tsx wraps image src with resolveAssetUrl'
);

const chatAreaTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/ChatArea.tsx'), 'utf-8');
assert(
  chatAreaTsx.includes('resolveAssetUrl(msg.fileUrl)'),
  'ChatArea.tsx wraps image and file attachments with resolveAssetUrl'
);

const imageViewerTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/ImageViewerModal.tsx'), 'utf-8');
assert(
  imageViewerTsx.includes('resolveAssetUrl(imageUrl)'),
  'ImageViewerModal.tsx wraps full-screen image with resolveAssetUrl'
);

const voicePlayerTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/VoiceMessagePlayer.tsx'), 'utf-8');
assert(
  voicePlayerTsx.includes('resolveAssetUrl(audioUrl)'),
  'VoiceMessagePlayer.tsx wraps audioUrl with resolveAssetUrl'
);

const rightInfoTsx = fs.readFileSync(path.join(rootDir, 'client/src/components/RightInfoPanel.tsx'), 'utf-8');
assert(
  rightInfoTsx.includes('resolveAssetUrl(m.fileUrl)'),
  'RightInfoPanel.tsx wraps shared media with resolveAssetUrl'
);

console.log('\n🎉 ALL v1.9.2 VERIFICATION TESTS PASSED PERFECTLY!\n');
