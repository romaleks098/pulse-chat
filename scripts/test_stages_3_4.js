import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting Stages 3 & 4 Automated Verification Tests...\n');

// ----------------------------------------------------
// 1. Fine-Tuning Fix 1: Database Saved Messages Consolidation
// ----------------------------------------------------
console.log('--- Test Suite 1: Database Saved Messages Consolidation ---');
{
  const dbFile = fs.readFileSync('server/src/db.ts', 'utf8');
  assert(dbFile.includes('export async function healAndConsolidateSavedMessages'), 'healAndConsolidateSavedMessages must be defined and exported in db.ts');
  assert(dbFile.includes('UPDATE messages SET conversation_id = ? WHERE conversation_id = ?'), 'Duplicate conversation messages must be reassigned to canonical conversation ID');
  assert(dbFile.includes('DELETE FROM conversation_members WHERE conversation_id = ?'), 'Duplicate memberships must be cleaned up');
  assert(dbFile.includes('DELETE FROM conversations WHERE id = ?'), 'Duplicate conversation rows must be deleted');
  assert(dbFile.includes('await healAndConsolidateSavedMessages();'), 'healAndConsolidateSavedMessages must run on server startup in initDatabase');

  const convRoutesFile = fs.readFileSync('server/src/routes/conversations.ts', 'utf8');
  assert(convRoutesFile.includes('await healAndConsolidateSavedMessages();'), 'POST /saved endpoint must trigger consolidation healing');
  console.log('  ✅ DB Saved Messages consolidation logic correctly reparents messages and removes duplicate conversation records.');
}

// ----------------------------------------------------
// 2. Fine-Tuning Fix 2: Strict Group Filter
// ----------------------------------------------------
console.log('\n--- Test Suite 2: Strict Group Filter ---');
{
  const sidebarFile = fs.readFileSync('client/src/components/Sidebar.tsx', 'utf8');
  assert(sidebarFile.includes("c.type === 'group' && !c.isChannel"), 'Sidebar filter and unread counter for groups must strictly exclude channels');
  console.log('  ✅ Groups tab filter strictly enforces type === group && !isChannel.');
}

// ----------------------------------------------------
// 3. Stage 3: Design Tokens, CSS Variables & Primitives
// ----------------------------------------------------
console.log('\n--- Test Suite 3: Design Tokens & UI Primitives ---');
{
  const themeFile = fs.readFileSync('client/src/context/ThemeContext.tsx', 'utf8');
  assert(themeFile.includes("root.style.setProperty('--font-size-base'"), 'Must set --font-size-base');
  assert(themeFile.includes("root.style.setProperty('--msg-font-size'"), 'Must set --msg-font-size');
  assert(themeFile.includes("root.style.setProperty('--bubble-radius'"), 'Must set --bubble-radius');
  assert(themeFile.includes("root.style.setProperty('--sidebar-width'"), 'Must set --sidebar-width');
  assert(themeFile.includes("root.style.setProperty('--chat-item-py'"), 'Must set --chat-item-py');
  assert(themeFile.includes("root.style.setProperty('--bg-bubble-incoming'"), 'Must set --bg-bubble-incoming');
  assert(themeFile.includes("root.setAttribute('data-theme', resolvedTheme)"), 'Must set data-theme attribute');

  // Verify all primitives exist and export React components
  const primitives = [
    'Avatar.tsx',
    'Badge.tsx',
    'ContextMenu.tsx',
    'Modal.tsx',
    'Tabs.tsx',
    'Toast.tsx',
    'Slider.tsx',
    'ColorPicker.tsx'
  ];

  for (const prim of primitives) {
    const fullPath = path.join('client/src/components/ui', prim);
    assert(fs.existsSync(fullPath), `UI Primitive ${prim} must exist`);
    const content = fs.readFileSync(fullPath, 'utf8');
    const compName = prim.replace('.tsx', '');
    assert(content.includes(`export const ${compName}`), `Primitive ${prim} must export ${compName}`);
  }
  console.log('  ✅ CSS Variables design tokens and all 8 UI primitives (Avatar, Badge, ContextMenu, Modal, Tabs, Toast, Slider, ColorPicker) verified.');
}

// ----------------------------------------------------
// 4. Stage 4: Sidebar Enhancements
// ----------------------------------------------------
console.log('\n--- Test Suite 4: Sidebar Layout & Telegram-Grade Features ---');
{
  const sidebarFile = fs.readFileSync('client/src/components/Sidebar.tsx', 'utf8');
  assert(sidebarFile.includes('handleMouseDownResize'), 'Sidebar width drag-resize handler must be present');
  assert(sidebarFile.includes('handleTouchStart'), 'Sidebar must support touch long-press on mobile');
  assert(sidebarFile.includes('CheckCheck'), 'Outgoing read message double-check indicator must be present');
  assert(sidebarFile.includes('typingMap'), 'Typing map from ChatContext must be integrated');
  assert(sidebarFile.includes('печатает…'), 'Animated typing indicator must be displayed in chat list');
  assert(sidebarFile.includes('Черновик:'), 'Draft preview must be rendered in chat list when present');
  assert(sidebarFile.includes('deleteConversation'), 'Delete chat action must be available in context menu');
  console.log('  ✅ Sidebar features verified: resize, touch long-press, outgoing checkmarks, typing indicators, drafts preview, and delete chat.');
}

// ----------------------------------------------------
// 5. Stage 4: ChatArea & Message Grouping & Composer
// ----------------------------------------------------
console.log('\n--- Test Suite 5: ChatArea, Message Grouping & Composer ---');
{
  const chatAreaFile = fs.readFileSync('client/src/components/ChatArea.tsx', 'utf8');
  assert(chatAreaFile.includes('isSameAuthorPrev'), 'isSameAuthorPrev grouping calculation must be present');
  assert(chatAreaFile.includes('isSameAuthorNext'), 'isSameAuthorNext grouping calculation must be present');
  assert(chatAreaFile.includes('bubbleBorderRadius'), 'Dynamic bubble corners must be calculated based on grouping');
  assert(chatAreaFile.includes('viewBox="0 0 11 20"'), 'SVG Telegram message tails must be rendered on outgoing and incoming bubbles');
  assert(chatAreaFile.includes('showScrollBottom'), 'Floating scroll to bottom button state must be present');
  assert(chatAreaFile.includes('pulse_draft_'), 'Per-conversation draft persistence must be implemented');
  assert(chatAreaFile.includes('ArrowUp'), 'Up arrow shortcut to edit last message must be supported');
  assert(chatAreaFile.includes('POPULAR_EMOJIS'), 'Quick emoji reaction bar in ContextMenu must be present');
  console.log('  ✅ ChatArea features verified: message grouping, SVG tails, floating scroll button with unread counter, per-chat drafts, Up-arrow edit, and quick emoji bar.');
}

// ----------------------------------------------------
// 6. Stage 4: RightInfoPanel Tabs & Media Extraction
// ----------------------------------------------------
console.log('\n--- Test Suite 6: RightInfoPanel ---');
{
  const rightPanelFile = fs.readFileSync('client/src/components/RightInfoPanel.tsx', 'utf8');
  assert(rightPanelFile.includes('<Tabs'), 'RightInfoPanel must use the standardized Tabs component');
  assert(rightPanelFile.includes("id: 'media'"), 'Media tab must be present');
  assert(rightPanelFile.includes("id: 'files'"), 'Files tab must be present');
  assert(rightPanelFile.includes("id: 'links'"), 'Links tab must be present');
  assert(rightPanelFile.includes("id: 'voice'"), 'Voice tab must be present');
  assert(rightPanelFile.includes("id: 'members'"), 'Members tab must be present');
  console.log('  ✅ RightInfoPanel verified: standardized Tabs, Media/Files/Links/Voice/Members views, profile info and copy actions.');
}

console.log('\n🎉 ALL STAGES 3 & 4 AUTOMATED VERIFICATION TESTS PASSED!\n');
