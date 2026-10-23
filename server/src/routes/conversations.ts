import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { broadcastToConversationMembers } from '../socket.js';

export const conversationsRouter = Router();

// Get all conversations for current user
conversationsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;

  try {
    const rows = await db.all<any>(`
      SELECT 
        c.id,
        c.type,
        c.name,
        c.avatar_url,
        c.pinned_message_id,
        c.is_saved,
        c.is_channel,
        c.description,
        c.updated_at,
        c.created_at,
        cm.last_read_at,
        cm.is_pinned,
        cm.is_muted,
        cm.is_archived
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
      ORDER BY cm.is_pinned DESC, c.updated_at DESC
    `, currentUserId);

    const result = await Promise.all(rows.map(async (conv) => {
      // Get all members for this conversation
      const members = await db.all<any>(`
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.status_text, u.last_seen, cm.role
        FROM conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?
      `, conv.id);

      // Get last message
      const lastMessage = await db.get<any>(`
        SELECT m.id, m.sender_id, m.text, m.type, m.file_name, m.voice_duration, m.created_at, m.is_deleted, u.display_name as sender_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `, conv.id);

      let chatName = conv.name;
      let chatAvatar = conv.avatar_url;
      let partner: any = null;

      if (conv.is_saved === 1) {
        chatName = 'Избранное';
        chatAvatar = '';
        partner = null;
      } else if (conv.type === 'direct') {
        partner = members.find((m) => m.id !== currentUserId) || members[0];
        if (partner) {
          chatName = partner.display_name;
          chatAvatar = partner.avatar_url;
        }
      }

      // Calculate unread count
      let unreadCount = 0;
      if (conv.last_read_at) {
        const countRes = await db.get<any>(`
          SELECT COUNT(*) as cnt FROM messages 
          WHERE conversation_id = ? AND created_at > ? AND sender_id != ? AND is_deleted = 0
        `, conv.id, conv.last_read_at, currentUserId);
        unreadCount = Number(countRes?.cnt || 0);
      } else {
        const countRes = await db.get<any>(`
          SELECT COUNT(*) as cnt FROM messages 
          WHERE conversation_id = ? AND sender_id != ? AND is_deleted = 0
        `, conv.id, currentUserId);
        unreadCount = Number(countRes?.cnt || 0);
      }

      // Fetch pinned message if any
      let pinnedMessage: any = null;
      if (conv.pinned_message_id) {
        const pm = await db.get<any>(`
          SELECT m.id, m.sender_id, m.text, m.type, m.file_name, m.file_url, m.voice_duration, m.created_at, u.display_name as sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.id = ? AND m.is_deleted = 0
        `, conv.pinned_message_id);
        if (pm) {
          pinnedMessage = {
            id: pm.id,
            senderId: pm.sender_id,
            senderName: pm.sender_name,
            text: pm.text,
            type: pm.type,
            fileName: pm.file_name,
            fileUrl: pm.file_url,
            voiceDuration: pm.voice_duration,
            createdAt: pm.created_at,
          };
        }
      }

      return {
        id: conv.id,
        type: conv.type,
        name: chatName,
        avatarUrl: chatAvatar,
        partner,
        members,
        pinnedMessageId: conv.pinned_message_id || null,
        pinnedMessage,
        isSaved: Boolean(conv.is_saved),
        isChannel: Boolean(conv.is_channel),
        isPinned: Boolean(conv.is_pinned),
        isMuted: Boolean(conv.is_muted),
        isArchived: Boolean(conv.is_archived),
        description: conv.description || '',
        unreadCount,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.sender_id,
              senderName: lastMessage.sender_name,
              text: lastMessage.is_deleted ? 'Сообщение удалено' : lastMessage.text,
              type: lastMessage.type,
              fileName: lastMessage.file_name,
              voiceDuration: lastMessage.voice_duration,
              createdAt: lastMessage.created_at,
            }
          : null,
        updatedAt: conv.updated_at,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('Fetch conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create direct conversation
conversationsRouter.post('/direct', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const { partnerId } = req.body;

  if (!partnerId) {
    return res.status(400).json({ error: 'partnerId is required' });
  }

  if (partnerId === currentUserId) {
    return res.status(400).json({ error: 'Cannot create direct chat with yourself' });
  }

  try {
    // Check if direct conversation already exists between these two users
    const existing = await db.get<any>(`
      SELECT c.id
      FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      WHERE c.type = 'direct'
      LIMIT 1
    `, currentUserId, partnerId);

    if (existing) {
      return res.json({ id: existing.id, isNew: false });
    }

    // Create new direct conversation
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.transaction(async () => {
      await db.run(`
        INSERT INTO conversations (id, type, created_by, created_at, updated_at)
        VALUES (?, 'direct', ?, ?, ?)
      `, convId, currentUserId, now, now);

      await db.run(`
        INSERT INTO conversation_members (conversation_id, user_id, role)
        VALUES (?, ?, 'member')
      `, convId, currentUserId);

      await db.run(`
        INSERT INTO conversation_members (conversation_id, user_id, role)
        VALUES (?, ?, 'member')
      `, convId, partnerId);
    });

    broadcastToConversationMembers(convId, 'conversation:new', {
      id: convId,
      type: 'direct',
      isSaved: false,
      createdAt: now,
    }, true);

    res.json({ id: convId, isNew: true });
  } catch (err) {
    console.error('Create direct chat error:', err);
    res.status(500).json({ error: 'Failed to create direct chat' });
  }
});

// Create group conversation
conversationsRouter.post('/group', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const { name, avatarUrl, memberIds = [] } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Group name is required' });
  }

  try {
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();
    const groupAvatar = avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name.trim())}`;
    const uniqueMembers = Array.from(new Set([currentUserId, ...memberIds]));

    await db.transaction(async () => {
      await db.run(`
        INSERT INTO conversations (id, type, name, avatar_url, created_by, created_at, updated_at)
        VALUES (?, 'group', ?, ?, ?, ?, ?)
      `, convId, name.trim(), groupAvatar, currentUserId, now, now);

      for (const mId of uniqueMembers) {
        await db.run(`
          INSERT INTO conversation_members (conversation_id, user_id, role)
          VALUES (?, ?, ?)
        `, convId, mId, mId === currentUserId ? 'owner' : 'member');
      }

      // Add system message
      const sysMsgId = crypto.randomUUID();
      await db.run(`
        INSERT INTO messages (id, conversation_id, sender_id, text, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'text', ?, ?)
      `, sysMsgId, convId, currentUserId, `Группа "${name.trim()}" создана`, now, now);
    });

    broadcastToConversationMembers(convId, 'conversation:new', {
      id: convId,
      type: 'group',
      name: name.trim(),
      avatarUrl: groupAvatar,
      createdAt: now,
    }, true);

    res.json({ id: convId, isNew: true });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Fetch messages for a conversation
conversationsRouter.get('/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;
  const limit = Math.min(Number(req.query.limit) || 60, 100);
  const before = req.query.before as string;

  try {
    // Check membership
    const isMember = await db.get<any>(`
      SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    let query = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        m.text,
        m.type,
        m.file_url,
        m.file_name,
        m.file_size,
        m.voice_duration,
        m.reply_to_id,
        m.is_deleted,
        m.seq,
        m.client_message_id,
        m.created_at,
        m.updated_at,
        u.username as sender_username,
        u.display_name as sender_name,
        u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
    `;

    const params: any[] = [convId];

    if (before) {
      query += ` AND m.created_at < ?`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT ?`;
    params.push(limit);

    const rawMessages = await db.all<any>(query, ...params);

    // Fetch reactions for these messages
    const messageIds = rawMessages.map((m) => m.id);
    let reactionsByMessage: Record<string, any[]> = {};

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const reactions = await db.all<any>(`
        SELECT r.id, r.message_id, r.user_id, r.emoji, u.display_name as user_name
        FROM reactions r
        JOIN users u ON u.id = r.user_id
        WHERE r.message_id IN (${placeholders})
      `, ...messageIds);

      for (const r of reactions) {
        if (!reactionsByMessage[r.message_id]) {
          reactionsByMessage[r.message_id] = [];
        }
        reactionsByMessage[r.message_id].push({
          userId: r.user_id,
          userName: r.user_name,
          emoji: r.emoji,
        });
      }
    }

    // Fetch reply messages details if any
    const replyIds = rawMessages.filter((m) => m.reply_to_id).map((m) => m.reply_to_id);
    let replyMap: Record<string, any> = {};

    if (replyIds.length > 0) {
      const placeholders = replyIds.map(() => '?').join(',');
      const replies = await db.all<any>(`
        SELECT m.id, m.text, m.type, m.file_name, m.voice_duration, u.display_name as sender_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id IN (${placeholders})
      `, ...replyIds);

      for (const r of replies) {
        replyMap[r.id] = {
          id: r.id,
          senderName: r.sender_name,
          text: r.text,
          type: r.type,
          fileName: r.file_name,
          voiceDuration: r.voice_duration,
        };
      }
    }

    const messages = rawMessages.reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderUsername: m.sender_username,
      senderName: m.sender_name,
      senderAvatar: m.sender_avatar,
      text: m.is_deleted ? 'Сообщение удалено' : m.text,
      type: m.type,
      fileUrl: m.file_url,
      fileName: m.file_name,
      fileSize: m.file_size,
      voiceDuration: m.voice_duration,
      replyTo: m.reply_to_id ? replyMap[m.reply_to_id] || null : null,
      replyToId: m.reply_to_id,
      seq: m.seq ? Number(m.seq) : undefined,
      clientMessageId: m.client_message_id,
      isDeleted: Boolean(m.is_deleted),
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      reactions: reactionsByMessage[m.id] || [],
    }));

    res.json(messages);
  } catch (err) {
    console.error('Fetch messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create or get "Saved Messages" ("Избранное")
conversationsRouter.post('/saved', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;

  try {
    const existing = await db.get<any>(`
      SELECT id FROM conversations WHERE created_by = ? AND is_saved = 1 LIMIT 1
    `, currentUserId);

    if (existing) {
      return res.json({ id: existing.id, isNew: false });
    }

    const convId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.transaction(async () => {
      await db.run(`
        INSERT INTO conversations (id, type, name, avatar_url, created_by, is_saved, created_at, updated_at)
        VALUES (?, 'direct', 'Избранное', 'https://api.dicebear.com/7.x/bottts/svg?seed=saved_messages_star', ?, 1, ?, ?)
      `, convId, currentUserId, now, now);

      await db.run(`
        INSERT INTO conversation_members (conversation_id, user_id, role)
        VALUES (?, ?, 'owner')
      `, convId, currentUserId);
    });

    broadcastToConversationMembers(convId, 'conversation:new', {
      id: convId,
      type: 'direct',
      name: 'Избранное',
      isSaved: true,
      createdAt: now,
    }, true, currentUserId);

    res.json({ id: convId, isNew: true });
  } catch (err) {
    console.error('Create saved messages error:', err);
    res.status(500).json({ error: 'Failed to get or create saved messages' });
  }
});

// Pin or unpin a message
conversationsRouter.post('/:id/pin', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;
  const { messageId } = req.body;

  try {
    const isMember = await db.get<any>(`
      SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    await db.run(`
      UPDATE conversations SET pinned_message_id = ? WHERE id = ?
    `, messageId || null, convId);

    let pinnedMessage: any = null;
    if (messageId) {
      const pm = await db.get<any>(`
        SELECT m.id, m.sender_id, m.text, m.type, m.file_name, m.file_url, m.voice_duration, m.created_at, u.display_name as sender_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id = ? AND m.is_deleted = 0
      `, messageId);

      if (pm) {
        pinnedMessage = {
          id: pm.id,
          senderId: pm.sender_id,
          senderName: pm.sender_name,
          text: pm.text,
          type: pm.type,
          fileName: pm.file_name,
          fileUrl: pm.file_url,
          voiceDuration: pm.voice_duration,
          createdAt: pm.created_at,
        };
      }
    }

    res.json({ success: true, pinnedMessageId: messageId || null, pinnedMessage });
  } catch (err) {
    console.error('Pin message error:', err);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Search messages in a conversation
conversationsRouter.get('/:id/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;
  const query = ((req.query.q as string) || '').trim();

  if (!query) {
    return res.json([]);
  }

  try {
    const isMember = await db.get<any>(`
      SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const messages = await db.all<any>(`
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        m.text,
        m.type,
        m.file_name,
        m.file_url,
        m.voice_duration,
        m.created_at,
        u.display_name as sender_name,
        u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? AND m.is_deleted = 0 AND (m.text LIKE ? OR m.file_name LIKE ?)
      ORDER BY m.created_at DESC
      LIMIT 30
    `, convId, `%${query}%`, `%${query}%`);

    res.json(messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderAvatar: m.sender_avatar,
      text: m.text,
      type: m.type,
      fileName: m.file_name,
      fileUrl: m.file_url,
      voiceDuration: m.voice_duration,
      createdAt: m.created_at,
    })));
  } catch (err) {
    console.error('Search messages error:', err);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Mark conversation as read
conversationsRouter.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;
  const now = new Date().toISOString();

  try {
    await db.run(`
      UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?
    `, now, convId, currentUserId);

    broadcastToConversationMembers(convId, 'conversation:read', {
      conversationId: convId,
      userId: currentUserId,
      readAt: now,
    }, true);

    res.json({ success: true, lastReadAt: now });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Toggle pin chat for current user
conversationsRouter.post('/:id/pin-chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;

  try {
    const member = await db.get<any>(`
      SELECT is_pinned FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!member) return res.status(404).json({ error: 'Chat not found' });

    const newPinned = member.is_pinned === 1 ? 0 : 1;
    await db.run(`
      UPDATE conversation_members SET is_pinned = ? WHERE conversation_id = ? AND user_id = ?
    `, newPinned, convId, currentUserId);

    res.json({ success: true, isPinned: Boolean(newPinned) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// Toggle mute chat for current user
conversationsRouter.post('/:id/mute', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;

  try {
    const member = await db.get<any>(`
      SELECT is_muted FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!member) return res.status(404).json({ error: 'Chat not found' });

    const newMuted = member.is_muted === 1 ? 0 : 1;
    await db.run(`
      UPDATE conversation_members SET is_muted = ? WHERE conversation_id = ? AND user_id = ?
    `, newMuted, convId, currentUserId);

    res.json({ success: true, isMuted: Boolean(newMuted) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle mute' });
  }
});

// Toggle archive chat for current user
conversationsRouter.post('/:id/archive', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;

  try {
    const member = await db.get<any>(`
      SELECT is_archived FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!member) return res.status(404).json({ error: 'Chat not found' });

    const newArchived = member.is_archived === 1 ? 0 : 1;
    await db.run(`
      UPDATE conversation_members SET is_archived = ? WHERE conversation_id = ? AND user_id = ?
    `, newArchived, convId, currentUserId);

    res.json({ success: true, isArchived: Boolean(newArchived) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle archive' });
  }
});

// Clear messages in conversation (for Saved Messages or clear history)
conversationsRouter.post('/:id/clear', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const convId = req.params.id;

  try {
    const isMember = await db.get<any>(`
      SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
    `, convId, currentUserId);

    if (!isMember) return res.status(403).json({ error: 'Not allowed' });

    await db.run(`
      UPDATE messages SET is_deleted = 1, text = 'История очищена' WHERE conversation_id = ?
    `, convId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
});

// Create channel
conversationsRouter.post('/channel', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user!.userId;
  const { name, description = '', avatarUrl } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  try {
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();
    const channelAvatar = avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=channel_${encodeURIComponent(name.trim())}`;

    await db.transaction(async () => {
      await db.run(`
        INSERT INTO conversations (id, type, name, avatar_url, description, is_channel, created_by, created_at, updated_at)
        VALUES (?, 'group', ?, ?, ?, 1, ?, ?, ?)
      `, convId, name.trim(), channelAvatar, description.trim(), currentUserId, now, now);

      await db.run(`
        INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at)
        VALUES (?, ?, 'owner', ?)
      `, convId, currentUserId, now);

      const sysMsgId = crypto.randomUUID();
      await db.run(`
        INSERT INTO messages (id, conversation_id, sender_id, text, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'text', ?, ?)
      `, sysMsgId, convId, currentUserId, `Канал "${name.trim()}" создан`, now, now);
    });

    broadcastToConversationMembers(convId, 'conversation:new', {
      id: convId,
      type: 'group',
      isChannel: true,
      name: name.trim(),
      avatarUrl: channelAvatar,
      description: description.trim(),
      createdAt: now,
    }, true, currentUserId);

    res.json({ id: convId, isNew: true });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});
