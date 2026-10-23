import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { db, recordSyncEvent } from './db.js';
import { verifyToken, TokenPayload } from './auth.js';

interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

// Track online users by userId -> Set of socketIds (multiple tabs/devices)
const onlineUsers = new Map<string, Set<string>>();

let ioInstance: Server | null = null;

/**
 * Broadcast an event to all connected devices of every participant in the conversation,
 * as well as into the conversation room.
 */
export async function broadcastToConversationMembers(
  conversationId: string,
  event: string,
  data: any,
  recordEvent = true,
  targetUserId?: string
) {
  if (!ioInstance) return;

  let seq = 0;
  if (recordEvent) {
    seq = await recordSyncEvent(event, conversationId, data, targetUserId);
  }
  const payload = seq ? { ...data, seq } : data;

  try {
    const members = await db.all<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
      conversationId
    );
    for (const m of members) {
      ioInstance.to(`user:${m.user_id}`).emit(event, payload);
    }
  } catch (err) {
    console.error('Error broadcasting to members:', err);
  }

  ioInstance.to(`conv_${conversationId}`).emit(event, payload);
}

/**
 * Broadcast an authentication success event to the Telegram auth room
 */
export function notifyTelegramAuthSuccess(loginSessionToken: string, payload: any) {
  if (!ioInstance) return;
  ioInstance.to(`tg_auth:${loginSessionToken}`).emit('telegram_auth_success', payload);
}

export function setupSocketServer(io: Server) {
  ioInstance = io;

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      // Allow anonymous sockets for Telegram Bot auth listeners
      if (socket.handshake.auth?.anonymousAuth) {
        return next();
      }
      return next(new Error('Authentication token required'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    socket.user = payload;
    next();
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      // Anonymous socket for Telegram bot auth listener
      socket.on('telegram_auth_listen', (loginToken: string) => {
        if (typeof loginToken === 'string' && loginToken.length > 5) {
          socket.join(`tg_auth:${loginToken}`);
        }
      });
      return;
    }

    const user = socket.user!;
    const userId = user.userId;

    // Register active socket for user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal user room so all devices/tabs of this user receive real-time sync
    socket.join(`user:${userId}`);

    // Auto-join all conversation rooms this user belongs to
    try {
      const convs = await db.all<{ conversation_id: string }>(
        'SELECT conversation_id FROM conversation_members WHERE user_id = ?',
        userId
      );

      for (const c of convs) {
        socket.join(`conv_${c.conversation_id}`);
      }
    } catch (err) {
      console.error('Failed to auto-join rooms:', err);
    }

    // Broadcast user online status
    io.emit('user:status', { userId, status: 'online' });

    // Send currently online users to the newly connected client
    socket.emit('users:online_list', Array.from(onlineUsers.keys()));

    // Join a specific conversation room
    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conv_${conversationId}`);
    });

    // Handle typing indicators
    socket.on('typing:start', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conv_${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: user.username,
        isTyping: true,
      });
    });

    socket.on('typing:stop', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conv_${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: user.username,
        isTyping: false,
      });
    });

    // Handle sending message
    socket.on('message:send', async (data: {
      conversationId: string;
      text: string;
      type?: 'text' | 'image' | 'file' | 'voice';
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      voiceDuration?: number;
      replyToId?: string;
      clientMessageId?: string;
    }) => {
      const { conversationId, text, type = 'text', fileUrl, fileName, fileSize, voiceDuration, replyToId, clientMessageId } = data;

      try {
        // Verify user is in conversation
        const isMember = await db.get(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
          conversationId,
          userId
        );

        if (!isMember) {
          return socket.emit('error', { message: 'You are not a member of this conversation' });
        }

        const msgId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Get sender details
        const sender = await db.get<any>('SELECT username, display_name, avatar_url FROM users WHERE id = ?', userId);

        // Get reply details if any
        let replyTo = null;
        if (replyToId) {
          const rawReply = await db.get<any>(`
            SELECT m.id, m.text, m.type, m.file_name, m.voice_duration, u.display_name as sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.id = ?
          `, replyToId);

          if (rawReply) {
            replyTo = {
              id: rawReply.id,
              senderName: rawReply.sender_name,
              text: rawReply.text,
              type: rawReply.type,
              fileName: rawReply.file_name,
              voiceDuration: rawReply.voice_duration,
            };
          }
        }

        const messageData = {
          id: msgId,
          clientMessageId: clientMessageId || null,
          conversationId,
          senderId: userId,
          senderUsername: sender?.username || user.username,
          senderName: sender?.display_name || user.username,
          senderAvatar: sender?.avatar_url || '',
          text: text || '',
          type,
          fileUrl,
          fileName,
          fileSize,
          voiceDuration: voiceDuration || null,
          replyTo,
          replyToId,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
          reactions: [],
        };

        // Record sync event to get monotonic sequence number (seq)
        const seq = await recordSyncEvent('message:new', conversationId, messageData);
        const fullMessage = { ...messageData, seq };

        // Save message & update conversation time
        await db.transaction(async () => {
          await db.run(`
            INSERT INTO messages (id, conversation_id, sender_id, text, type, file_url, file_name, file_size, voice_duration, reply_to_id, client_message_id, seq, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, msgId, conversationId, userId, text || '', type, fileUrl || null, fileName || null, fileSize || null, voiceDuration || null, replyToId || null, clientMessageId || null, seq, now, now);

          await db.run(
            'UPDATE conversations SET updated_at = ? WHERE id = ?',
            now,
            conversationId
          );
        });

        // Broadcast to all participants' rooms (user:<userId>) and conv room
        await broadcastToConversationMembers(conversationId, 'message:new', fullMessage, false);
      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle pin message in real-time
    socket.on('conversation:pin', async ({ conversationId, messageId }: { conversationId: string; messageId: string | null }) => {
      try {
        await db.run('UPDATE conversations SET pinned_message_id = ? WHERE id = ?', messageId || null, conversationId);

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

        await broadcastToConversationMembers(conversationId, 'conversation:pinned', {
          conversationId,
          pinnedMessageId: messageId || null,
          pinnedMessage,
        }, true);
      } catch (err) {
        console.error('Pin socket error:', err);
      }
    });

    // Handle reaction toggle
    socket.on('message:react', async ({ messageId, emoji, conversationId }: { messageId: string; emoji: string; conversationId: string }) => {
      try {
        const existing = await db.get<any>(
          'SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
          messageId,
          userId,
          emoji
        );

        if (existing) {
          await db.run('DELETE FROM reactions WHERE id = ?', existing.id);
        } else {
          const reactId = crypto.randomUUID();
          await db.run(
            'INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
            reactId,
            messageId,
            userId,
            emoji
          );
        }

        // Get updated reactions for this message
        const reactions = await db.all<any>(`
          SELECT r.id, r.message_id, r.user_id, r.emoji, u.display_name as user_name
          FROM reactions r
          JOIN users u ON u.id = r.user_id
          WHERE r.message_id = ?
        `, messageId);

        const mappedReactions = reactions.map((r) => ({
          userId: r.user_id,
          userName: r.user_name,
          emoji: r.emoji,
        }));

        await broadcastToConversationMembers(conversationId, 'message:reactions_updated', {
          conversationId,
          messageId,
          reactions: mappedReactions,
        }, true);
      } catch (err) {
        console.error('Reaction toggle error:', err);
      }
    });

    // Handle edit message
    socket.on('message:edit', async ({ messageId, newText, conversationId }: { messageId: string; newText: string; conversationId: string }) => {
      try {
        const msg = await db.get<any>('SELECT sender_id, is_deleted FROM messages WHERE id = ?', messageId);
        if (!msg || msg.sender_id !== userId || msg.is_deleted) {
          return socket.emit('error', { message: 'Cannot edit this message' });
        }

        const now = new Date().toISOString();
        await db.run('UPDATE messages SET text = ?, updated_at = ? WHERE id = ?', newText.trim(), now, messageId);

        await broadcastToConversationMembers(conversationId, 'message:edited', {
          conversationId,
          messageId,
          text: newText.trim(),
          updatedAt: now,
        }, true);
      } catch (err) {
        console.error('Edit message error:', err);
      }
    });

    // Handle delete message
    socket.on('message:delete', async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      try {
        const msg = await db.get<any>('SELECT sender_id FROM messages WHERE id = ?', messageId);
        if (!msg || msg.sender_id !== userId) {
          return socket.emit('error', { message: 'Cannot delete this message' });
        }

        const now = new Date().toISOString();
        await db.run('UPDATE messages SET is_deleted = 1, text = ?, updated_at = ? WHERE id = ?', '', now, messageId);

        await broadcastToConversationMembers(conversationId, 'message:deleted', {
          conversationId,
          messageId,
        }, true);
      } catch (err) {
        console.error('Delete message error:', err);
      }
    });

    // WebRTC Calling signaling events
    socket.on('call:start', async ({ conversationId, isVideo }: { conversationId: string; isVideo: boolean }) => {
      try {
        const conv = await db.get<any>('SELECT is_saved, type FROM conversations WHERE id = ?', conversationId);
        if (!conv || Number(conv.is_saved) === 1 || conv.is_saved === true) {
          socket.emit('call:error', { message: 'Нельзя позвонить в Избранное' });
          return;
        }

        const otherMembers = await db.all<any>(
          'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?',
          conversationId,
          userId
        );
        if (otherMembers.length === 0) {
          socket.emit('call:error', { message: 'В чате нет других участников для звонка' });
          return;
        }

        const caller = await db.get<any>('SELECT display_name, avatar_url FROM users WHERE id = ?', userId);
        socket.to(`conv_${conversationId}`).emit('call:incoming', {
          conversationId,
          callerId: userId,
          callerName: caller?.display_name || user.username,
          callerAvatar: caller?.avatar_url || '',
          isVideo: Boolean(isVideo),
        });
      } catch (err) {
        console.error('Call start error:', err);
      }
    });

    socket.on('call:accept', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conv_${conversationId}`).emit('call:accepted', {
        conversationId,
        accepterId: userId,
      });
    });

    socket.on('call:reject', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conv_${conversationId}`).emit('call:rejected', {
        conversationId,
        rejecterId: userId,
      });
    });

    socket.on('call:end', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conv_${conversationId}`).emit('call:ended', {
        conversationId,
        endedBy: userId,
      });
    });

    socket.on('call:signal', ({ conversationId, signal }: { conversationId: string; signal: any }) => {
      socket.to(`conv_${conversationId}`).emit('call:signal', {
        conversationId,
        senderId: userId,
        signal,
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          const now = new Date().toISOString();
          try {
            await db.run('UPDATE users SET last_seen = ? WHERE id = ?', now, userId);
          } catch {}
          io.emit('user:status', { userId, status: 'offline', lastSeen: now });
        }
      }
    });
  });
}
