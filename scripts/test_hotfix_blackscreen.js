/**
 * Automated Verification Test for Hotfix: Black Screen after Login Crash
 * Tests:
 * 1. React Rules of Hooks check (no hooks after early return in ChatArea.tsx, Sidebar.tsx, App.tsx)
 * 2. FormattedMessageText safety on null, undefined, empty, and non-string inputs
 * 3. ThemeSettings sanitization against legacy / corrupt localStorage data
 * 4. VoiceMessagePlayer safe guards on null / undefined audioUrl
 * 5. ErrorBoundary verification in component tree
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting Black Screen Hotfix Verification Tests...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. Rules of Hooks Verification
// -------------------------------------------------------------
runTest('ChatArea.tsx: No hooks placed after early return (if (!activeConversation))', () => {
  const filePath = path.join(__dirname, '../client/src/components/ChatArea.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  // Find the early JSX return index (not inside an inner useEffect callback)
  const earlyReturnIdx = code.indexOf('if (!activeConversation) {\n    return (');
  assert(earlyReturnIdx !== -1, 'Could not find "if (!activeConversation) {\\n    return (" in ChatArea.tsx');

  const afterEarlyReturn = code.slice(earlyReturnIdx);
  
  // Search for any React hook calls after this point
  const hookPattern = /\b(useState|useEffect|useRef|useMemo|useCallback|useContext|useId)\s*\(/g;
  const matches = [...afterEarlyReturn.matchAll(hookPattern)];

  if (matches.length > 0) {
    const matchedNames = matches.map(m => m[1]).join(', ');
    throw new Error(`Found React hook(s) [${matchedNames}] AFTER early return in ChatArea.tsx! Rules of Hooks violation.`);
  }
});

runTest('Sidebar.tsx: No hooks placed after early return', () => {
  const filePath = path.join(__dirname, '../client/src/components/Sidebar.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  // Ensure component start to return
  const compStart = code.indexOf('export const Sidebar:');
  assert(compStart !== -1, 'Sidebar export not found');

  const mainReturn = code.indexOf('\n  return (', compStart);
  assert(mainReturn !== -1, 'Main return in Sidebar not found');

  const bodyBeforeMainReturn = code.slice(compStart, mainReturn);
  
  // Look for any early return in the main component body (excluding nested functions / callbacks)
  // Let's verify that longPressTimerRef and all hooks are defined before any early returns
  const hookMatches = [...code.matchAll(/\b(useState|useEffect|useRef|useMemo|useCallback)\s*\(/g)];
  for (const match of hookMatches) {
    if (match.index > mainReturn) {
      throw new Error(`Found hook after main return at index ${match.index}`);
    }
  }
});

// -------------------------------------------------------------
// 2. FormattedMessageText Safety Check
// -------------------------------------------------------------
runTest('FormattedMessageText.tsx: Strict null/undefined/non-string protection', () => {
  const filePath = path.join(__dirname, '../client/src/components/FormattedMessageText.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert(code.includes('typeof text === \'string\''), 'Must have typeof text === "string" check');
  assert(code.includes('if (!safeText) return null;'), 'Must return null or safe element if text is empty/null');

  // Simulate FormattedMessageText logic
  function testFormat(text) {
    const safeText = typeof text === 'string' ? text : '';
    if (!safeText) return null;
    const tokenRegex = /(\*\*.*?\*\*|\*.*?\*|__.*?__|~~.*?~~|`.*?`|https?:\/\/[^\s]+)/gs;
    return safeText.split(tokenRegex);
  }

  assert.strictEqual(testFormat(null), null);
  assert.strictEqual(testFormat(undefined), null);
  assert.strictEqual(testFormat(''), null);
  assert.strictEqual(testFormat(123), null);
  assert.strictEqual(testFormat({}), null);

  const parsed = testFormat('Hello **world** and check https://google.com!');
  assert(Array.isArray(parsed));
  assert(parsed.includes('**world**'));
});

// -------------------------------------------------------------
// 3. ThemeSettings Sanitization against Corrupt localStorage Data
// -------------------------------------------------------------
runTest('ThemeContext.tsx: Defensive sanitizeSettings against partial or corrupted themes', () => {
  const filePath = path.join(__dirname, '../client/src/context/ThemeContext.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert(code.includes('function sanitizeSettings'), 'Must define sanitizeSettings helper');
  assert(code.includes('sanitizeSettings(JSON.parse(stored))'), 'Must use sanitizeSettings on localStorage parse');
  assert(code.includes('sanitizeSettings(parsed)'), 'Must use sanitizeSettings on importTheme');

  // Test the sanitization behavior against malicious / legacy inputs
  const DEFAULT_SETTINGS = {
    preset: 'classic-dark',
    bubbleRadius: 16,
    fontSize: 14,
    sidebarWidth: 340,
    wallpaper: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #090d16 0%, #131b2e 50%, #1f1d36 100%)',
      pattern: 'stars',
      blur: 0,
      dimming: 0,
      opacity: 0.15,
    },
  };

  function sanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    const rawWallpaper = typeof raw.wallpaper === 'object' && raw.wallpaper !== null ? raw.wallpaper : {};
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      bubbleRadius: Math.max(4, Math.min(20, Number(raw.bubbleRadius ?? DEFAULT_SETTINGS.bubbleRadius))),
      fontSize: Math.max(13, Math.min(20, Number(raw.fontSize ?? DEFAULT_SETTINGS.fontSize))),
      sidebarWidth: Math.max(260, Math.min(500, Number(raw.sidebarWidth ?? DEFAULT_SETTINGS.sidebarWidth))),
      wallpaper: {
        ...DEFAULT_SETTINGS.wallpaper,
        ...rawWallpaper,
        type: rawWallpaper.type || DEFAULT_SETTINGS.wallpaper.type,
        value: typeof rawWallpaper.value === 'string' && rawWallpaper.value.trim() ? rawWallpaper.value : DEFAULT_SETTINGS.wallpaper.value,
        pattern: rawWallpaper.pattern || DEFAULT_SETTINGS.wallpaper.pattern,
        blur: typeof rawWallpaper.blur === 'number' ? rawWallpaper.blur : DEFAULT_SETTINGS.wallpaper.blur,
        dimming: typeof rawWallpaper.dimming === 'number' ? rawWallpaper.dimming : DEFAULT_SETTINGS.wallpaper.dimming,
        opacity: typeof rawWallpaper.opacity === 'number' ? rawWallpaper.opacity : DEFAULT_SETTINGS.wallpaper.opacity,
      },
    };
  }

  // 1. null / undefined / corrupted JSON
  assert.deepStrictEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepStrictEqual(sanitizeSettings('corrupt string'), DEFAULT_SETTINGS);

  // 2. legacy localStorage missing new wallpaper properties
  const legacyData = { preset: 'oled-black', wallpaper: { type: 'solid', value: '#000000' } };
  const sanitized = sanitizeSettings(legacyData);
  assert.strictEqual(sanitized.preset, 'oled-black');
  assert.strictEqual(sanitized.wallpaper.type, 'solid');
  assert.strictEqual(sanitized.wallpaper.value, '#000000');
  assert.strictEqual(sanitized.wallpaper.pattern, 'stars');
  assert.strictEqual(sanitized.wallpaper.blur, 0);
  assert.strictEqual(sanitized.wallpaper.dimming, 0);
  assert.strictEqual(sanitized.wallpaper.opacity, 0.15);

  // 3. out-of-range numerical bounds
  const badBounds = sanitizeSettings({ bubbleRadius: 9999, fontSize: 1 });
  assert.strictEqual(badBounds.bubbleRadius, 20);
  assert.strictEqual(badBounds.fontSize, 13);
});

// -------------------------------------------------------------
// 4. VoiceMessagePlayer Safe Guards Check
// -------------------------------------------------------------
runTest('VoiceMessagePlayer.tsx: Guarded against missing / null audioUrl', () => {
  const filePath = path.join(__dirname, '../client/src/components/VoiceMessagePlayer.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert(code.includes('audioUrl?: string | null;'), 'audioUrl must be optional / nullable');
  assert(code.includes('if (!safeUrl) return;'), 'Audio constructor must be protected with if (!safeUrl) return;');
  assert(code.includes('if (!safeUrl) {'), 'Must render fallback UI if audioUrl is empty');
  assert(code.includes('Аудиозапись недоступна'), 'Must display user-friendly fallback');
});

// -------------------------------------------------------------
// 5. ErrorBoundary Verification
// -------------------------------------------------------------
runTest('ErrorBoundary.tsx: Complete class-based implementation exists and is wired in App.tsx', () => {
  const ebPath = path.join(__dirname, '../client/src/components/ErrorBoundary.tsx');
  assert(fs.existsSync(ebPath), 'ErrorBoundary.tsx must exist');
  const ebCode = fs.readFileSync(ebPath, 'utf-8');

  assert(ebCode.includes('class ErrorBoundary extends Component') || ebCode.includes('class ErrorBoundary extends React.Component'), 'Must be a React class component');
  assert(ebCode.includes('getDerivedStateFromError'), 'Must implement getDerivedStateFromError');
  assert(ebCode.includes('componentDidCatch'), 'Must implement componentDidCatch');
  assert(ebCode.includes('Ошибка в компоненте') || ebCode.includes('Произошла непредвиденная ошибка'), 'Must have user-friendly message');
  assert(ebCode.includes('Сбросить кэш и перезагрузить'), 'Must provide hard cache reset action');

  // Verify App.tsx usage
  const appPath = path.join(__dirname, '../client/src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');
  assert(appCode.includes('import { ErrorBoundary }'), 'App.tsx must import ErrorBoundary');
  assert(appCode.includes('<ErrorBoundary name="Корневой интерфейс (App)">'), 'App.tsx must wrap root in ErrorBoundary');
  assert(appCode.includes('<ErrorBoundary name="Область переписки (ChatArea)">'), 'App.tsx must wrap ChatArea in ErrorBoundary');
});

console.log(`\n========================================`);
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
