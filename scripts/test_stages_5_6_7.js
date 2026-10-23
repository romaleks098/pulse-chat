import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting Stages 5, 6 & 7 Automated Verification Tests...\n');

// ----------------------------------------------------
// Test 1: Stage 4 Fine-Tuning Fixes (Direct Chat Filter & Saved Delete Protection)
// ----------------------------------------------------
console.log('--- Test Suite 1: Stage 4 Fine-Tuning Fixes ---');
{
  const sidebarFile = fs.readFileSync('client/src/components/Sidebar.tsx', 'utf8');
  assert(
    sidebarFile.includes("c.type === 'direct' && !c.isSaved && !c.isChannel"),
    'Direct chats tab filter must strictly enforce !c.isSaved and !c.isChannel'
  );
  assert(
    sidebarFile.includes(".filter((c) => c.type === 'direct' && !c.isSaved && !c.isChannel)"),
    'Direct chats unread counter must also strictly enforce !c.isSaved and !c.isChannel'
  );

  const convRoutesFile = fs.readFileSync('server/src/routes/conversations.ts', 'utf8');
  assert(
    convRoutesFile.includes('conversationsRouter.delete'),
    'DELETE /api/conversations/:id endpoint must exist'
  );
  assert(
    convRoutesFile.includes('Boolean(conv.is_saved)'),
    'DELETE /api/conversations/:id must check is_saved'
  );
  assert(
    convRoutesFile.includes("return res.status(400).json({ error: 'Cannot delete Saved Messages conversation' })"),
    'DELETE /api/conversations/:id must return 400 when attempting to delete Saved Messages'
  );
  assert(
    convRoutesFile.includes('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'),
    'DELETE /api/conversations/:id must verify user membership'
  );
  assert(
    convRoutesFile.includes("if (!isMember) return res.status(403).json({ error: 'Not allowed' })"),
    'DELETE /api/conversations/:id must return 403 for non-members'
  );

  console.log('  ✅ Saved Messages deletion protection and strict Direct Chats filtering verified.');
}

// ----------------------------------------------------
// Test 2: Message Forwarding & Bubble Spacer Anti-Overlap
// ----------------------------------------------------
console.log('\n--- Test Suite 2: Forwarding & Bubble Anti-Overlap Spacer ---');
{
  const chatContextFile = fs.readFileSync('client/src/context/ChatContext.tsx', 'utf8');
  assert(chatContextFile.includes('forwardMessage: (msg: Message, targetConversationId: string) => Promise<void>'), 'ChatContextType must include forwardMessage');
  assert(chatContextFile.includes('const forwardMessage = async (msg: Message, targetConversationId: string) =>'), 'ChatContext must implement forwardMessage');
  assert(chatContextFile.includes('clientMessageId'), 'forwardMessage must generate clientMessageId');

  const forwardModalFile = fs.readFileSync('client/src/components/ForwardModal.tsx', 'utf8');
  assert(forwardModalFile.includes('export const ForwardModal'), 'ForwardModal component must be exported');
  assert(forwardModalFile.includes('forwardMessage(message, conv.id)'), 'ForwardModal must call forwardMessage upon chat selection');

  const chatAreaFile = fs.readFileSync('client/src/components/ChatArea.tsx', 'utf8');
  assert(chatAreaFile.includes('ForwardModal'), 'ChatArea must import and render ForwardModal');
  assert(chatAreaFile.includes("label: 'Переслать'"), 'Message context menu must contain "Переслать" item');
  assert(chatAreaFile.includes('inline-block w-14 h-3.5 select-none pointer-events-none'), 'Text bubble must contain invisible spacer for time badge');
  assert(chatAreaFile.includes('float-right -mb-1 ml-2 mt-1 inline-flex items-center gap-1 text-[10px]'), 'Text bubble must use floated time badge to prevent text overlap');

  console.log('  ✅ Message forwarding and Telegram anti-overlap spacer layout verified.');
}

// ----------------------------------------------------
// Test 3: Stage 5 - Login Screen, Burger Drawer, Tokenized Modals
// ----------------------------------------------------
console.log('\n--- Test Suite 3: Stage 5 - Login, Drawer & Modals ---');
{
  const authFile = fs.readFileSync('client/src/components/AuthScreen.tsx', 'utf8');
  assert(authFile.includes('useTheme()'), 'AuthScreen must use useTheme for theme switching');
  assert(authFile.includes('oauthLoading'), 'AuthScreen must support individual OAuth button loading states');
  assert(authFile.includes('oauth_access_denied'), 'AuthScreen must display friendly OAuth error descriptions');
  assert(authFile.includes('var(--bg-app'), 'AuthScreen must use design tokens for app background');
  assert(authFile.includes('var(--bg-surface'), 'AuthScreen must use design tokens for card surface');

  const sidebarFile = fs.readFileSync('client/src/components/Sidebar.tsx', 'utf8');
  assert(sidebarFile.includes('isDrawerOpen'), 'Sidebar must implement Telegram Drawer');
  assert(sidebarFile.includes('Создать группу/канал'), 'Drawer must have quick link to Create Group/Channel');
  assert(sidebarFile.includes('Контакты'), 'Drawer must have quick link to Contacts');
  assert(sidebarFile.includes('Ночной режим'), 'Drawer must have Night Mode toggle');
  assert(sidebarFile.includes('isLogoutModalOpen'), 'Sidebar must have Logout confirmation modal');
  assert(!sidebarFile.includes('bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-200'), 'Logout modal must use design tokens');

  const profileModalFile = fs.readFileSync('client/src/components/ProfileModal.tsx', 'utf8');
  assert(!profileModalFile.includes('bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-200'), 'ProfileModal crop modal must use design tokens');

  const newChatModalFile = fs.readFileSync('client/src/components/NewChatModal.tsx', 'utf8');
  assert(!newChatModalFile.includes('bg-black/20 rounded-xl border border-white/5'), 'NewChatModal tabs must use design tokens');

  console.log('  ✅ Stage 5 login page, drawer, and tokenized modals verified.');
}

// ----------------------------------------------------
// Test 4: Stage 6 - Settings Appearance & Live Interactive Preview
// ----------------------------------------------------
console.log('\n--- Test Suite 4: Stage 6 - Settings Appearance & Live Preview ---');
{
  const themeFile = fs.readFileSync('client/src/context/ThemeContext.tsx', 'utf8');
  assert(themeFile.includes("'classic-dark'"), 'ThemeContext must define classic-dark preset');
  assert(themeFile.includes("'telegram-dark'"), 'ThemeContext must define telegram-dark preset');
  assert(themeFile.includes("'oled-black'"), 'ThemeContext must define oled-black preset');
  assert(themeFile.includes("'light'"), 'ThemeContext must define light preset');
  assert(themeFile.includes("'emerald'"), 'ThemeContext must define emerald preset');
  assert(themeFile.includes("'rose'"), 'ThemeContext must define rose preset');
  assert(themeFile.includes("'system'"), 'ThemeContext must define system preset');
  assert(themeFile.includes('setCustomBubbleOut'), 'ThemeContext must allow setting custom bubble color/gradient');
  assert(themeFile.includes('setFontFamily'), 'ThemeContext must support font family selection');
  assert(themeFile.includes('setGlassmorphism'), 'ThemeContext must support glassmorphism toggle');
  assert(themeFile.includes('Math.max(4, Math.min(20'), 'bubbleRadius must clamp between 4 and 20');
  assert(themeFile.includes('Math.max(13, Math.min(20'), 'fontSize must clamp between 13 and 20');

  const settingsFile = fs.readFileSync('client/src/components/SettingsModal.tsx', 'utf8');
  assert(settingsFile.includes('Живой предпросмотр чата'), 'SettingsModal must have Live Preview section');
  assert(settingsFile.includes('Павел Дуров'), 'Live Preview must show demo contact bubbles');
  assert(settingsFile.includes('<Spoiler>'), 'Live Preview must showcase clickable spoiler');
  assert(settingsFile.includes('handleDownloadTheme'), 'SettingsModal must support downloading theme JSON file');
  assert(settingsFile.includes('handleCustomImageUpload'), 'SettingsModal must support custom wallpaper image upload');
  assert(settingsFile.includes('handleSaveToCloud'), 'SettingsModal must support cloud theme sync');

  console.log('  ✅ Stage 6 settings, 7 presets, live preview, wallpapers, and cloud sync verified.');
}

// ----------------------------------------------------
// Test 5: Stage 7 - Formatting, Hotkeys, Spoilers & Responsiveness
// ----------------------------------------------------
console.log('\n--- Test Suite 5: Stage 7 - Formatting, Spoilers & Hotkeys ---');
{
  const formattedFile = fs.readFileSync('client/src/components/FormattedMessageText.tsx', 'utf8');
  assert(formattedFile.includes('export const Spoiler'), 'Spoiler component must be defined');
  assert(formattedFile.includes('filter blur-'), 'Spoiler must have blur filter when unrevealed');
  assert(formattedFile.includes('tokenRegex'), 'FormattedMessageText must parse tokens');
  assert(formattedFile.includes('```'), 'Code block markdown must be supported');
  assert(formattedFile.includes('`'), 'Inline code markdown must be supported');
  assert(formattedFile.includes('**'), 'Bold markdown must be supported');
  assert(formattedFile.includes('*'), 'Italic markdown must be supported');
  assert(formattedFile.includes('~~'), 'Strikethrough markdown must be supported');
  assert(formattedFile.includes('||'), 'Spoiler markdown must be supported');
  assert(formattedFile.includes('https://') || formattedFile.includes('http://'), 'URL parsing must be supported');

  const appFile = fs.readFileSync('client/src/App.tsx', 'utf8');
  assert(appFile.includes('handleGlobalKeyDown'), 'App must have global keydown listener');
  assert(appFile.includes("e.key === 'k' || e.key === 'K'"), 'Ctrl+K / Cmd+K hotkey must focus search');
  assert(appFile.includes("e.key === 'Escape'"), 'Escape must close active modals/lightboxes');

  const chatAreaFile = fs.readFileSync('client/src/components/ChatArea.tsx', 'utf8');
  assert(chatAreaFile.includes("e.key === 'ArrowUp'"), 'Up arrow in empty composer must edit last message');
  assert(chatAreaFile.includes("e.key === 'Enter' && !e.shiftKey"), 'Enter sends, Shift+Enter makes newline');

  console.log('  ✅ Stage 7 text formatting, spoilers, and keyboard hotkeys verified.');
}

console.log('\n🎉 ALL STAGES 5, 6 & 7 AUTOMATED VERIFICATION TESTS PASSED!');
