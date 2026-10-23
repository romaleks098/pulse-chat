import assert from 'assert';
import { db, initDatabase, healAndConsolidateSavedMessages } from '../server/dist/db.js';

console.log('🧪 Testing healAndConsolidateSavedMessages in live DB...');

async function run() {
  process.env.NODE_ENV = 'test';
  await initDatabase();

  const testUserId = 'test_user_heal_' + Date.now();
  const conv1Id = 'conv_heal_1_' + Date.now();
  const conv2Id = 'conv_heal_2_' + Date.now();
  const conv3Id = 'conv_heal_3_' + Date.now();
  const now = new Date().toISOString();

  // Create user
  await db.run(
    'INSERT INTO users (id, username, password_hash, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    testUserId, `u_${Date.now()}`, 'hash', 'Test User', '', now
  );

  // Insert 3 duplicate saved conversations for this user
  await db.run(
    'INSERT INTO conversations (id, type, name, avatar_url, is_saved, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    conv1Id, 'direct', 'Избранное', '', 1, testUserId, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'
  );
  await db.run(
    'INSERT INTO conversations (id, type, name, avatar_url, is_saved, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    conv2Id, 'direct', 'Избранное', '', 1, testUserId, '2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00.000Z'
  );
  await db.run(
    'INSERT INTO conversations (id, type, name, avatar_url, is_saved, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    conv3Id, 'direct', 'Избранное', '', 1, testUserId, '2026-01-03T10:00:00.000Z', '2026-01-03T10:00:00.000Z'
  );

  // Insert messages into each duplicate conversation
  await db.run(
    'INSERT INTO messages (id, conversation_id, sender_id, text, type, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'msg_1_' + Date.now(), conv1Id, testUserId, 'Note in conv 1', 'text', 0, now, now
  );
  await db.run(
    'INSERT INTO messages (id, conversation_id, sender_id, text, type, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'msg_2_' + Date.now(), conv2Id, testUserId, 'Note in conv 2 (message A)', 'text', 0, now, now
  );
  await db.run(
    'INSERT INTO messages (id, conversation_id, sender_id, text, type, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'msg_3_' + Date.now(), conv2Id, testUserId, 'Note in conv 2 (message B)', 'text', 0, now, now
  );
  await db.run(
    'INSERT INTO messages (id, conversation_id, sender_id, text, type, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'msg_4_' + Date.now(), conv3Id, testUserId, 'Note in conv 3', 'text', 0, now, now
  );

  // Verify before healing: 3 conversations, 4 total messages
  const beforeConvs = await db.all('SELECT id FROM conversations WHERE created_by = ? AND is_saved = 1', testUserId);
  assert.strictEqual(beforeConvs.length, 3, 'Should have 3 duplicate saved conversations before heal');

  // Run heal function
  await healAndConsolidateSavedMessages();

  // Verify after healing:
  // 1. Exactly 1 saved conversation remains for this user
  const afterConvs = await db.all('SELECT id FROM conversations WHERE created_by = ? AND is_saved = 1', testUserId);
  assert.strictEqual(afterConvs.length, 1, 'Should have exactly 1 canonical saved conversation after heal');
  const canonicalId = afterConvs[0].id;

  // Conv2 had 2 messages (the most), so it is canonical
  assert.strictEqual(canonicalId, conv2Id, 'Canonical conversation should be the one with the most messages (conv2)');

  // 2. All 4 messages must now belong to canonicalId
  const canonicalMessages = await db.all('SELECT id, text FROM messages WHERE conversation_id = ?', canonicalId);
  assert.strictEqual(canonicalMessages.length, 4, 'All 4 messages must now belong to canonical conversation');

  // 3. Duplicate conversation IDs must no longer exist in conversations table
  const dupCheck = await db.all('SELECT id FROM conversations WHERE id IN (?, ?)', conv1Id, conv3Id);
  assert.strictEqual(dupCheck.length, 0, 'Duplicate conversations must be completely deleted from conversations table');

  console.log('✅ healAndConsolidateSavedMessages successfully passed: consolidated 4 messages from 3 duplicates into 1 canonical conversation!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
