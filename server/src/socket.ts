import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { db } from './db.js';
import { verifyToken, TokenPayload } from './auth.js';

interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

// Maps userId to set of active socketIds
const onlineUsers = new Map<string, Set<string>>();

export function setupSocketServer(io: Server) {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    socket.user = payload;
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    const userId = user.userId;

    // Register active socket for user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Auto-join all conversation rooms this user belongs to
    try {
      const convs = db.prepare(`
        SELECT conversation_id FROM conversation_members WHERE user_id = ?
      `).all(userId) as { conversation_id: string }[];

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

    // Handle sending a message
    socket.on('message:send', async (data: {
      conversationId: string;
      text: string;
      type?: 'text' | 'image' | 'file' | 'voice';
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      voiceDuration?: number;
      replyToId?: string;
    }) => {
      const { conversationId, text, type = 'text', fileUrl, fileName, fileSize, voiceDuration, replyToId } = data;

      try {
        // Verify user is in conversation
        const isMember = db.prepare(`
          SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
        `).get(conversationId, userId);

        if (!isMember) {
          return socket.emit('error', { message: 'You are not a member of this conversation' });
        }

        const msgId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Save message & update conversation time
        const insertMsg = db.transaction(() => {
          db.prepare(`
            INSERT INTO messages (id, conversation_id, sender_id, text, type, file_url, file_name, file_size, voice_duration, reply_to_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(msgId, conversationId, userId, text || '', type, fileUrl || null, fileName || null, fileSize || null, voiceDuration || null, replyToId || null, now, now);

          db.prepare(`
            UPDATE conversations SET updated_at = ? WHERE id = ?
          `).run(now, conversationId);
        });

        insertMsg();

        // Get sender details
        const sender = db.prepare(`
          SELECT username, display_name, avatar_url FROM users WHERE id = ?
        `).get(userId) as any;

        // Get reply details if any
        let replyTo = null;
        if (replyToId) {
          const rawReply = db.prepare(`
            SELECT m.id, m.text, m.type, m.file_name, m.voice_duration, u.display_name as sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.id = ?
          `).get(replyToId) as any;

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

        const fullMessage = {
          id: msgId,
          conversationId,
          senderId: userId,
          senderUsername: sender.username,
          senderName: sender.display_name,
          senderAvatar: sender.avatar_url,
          text,
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

        // Broadcast to all participants in this conversation
        io.to(`conv_${conversationId}`).emit('message:new', fullMessage);
      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle pin message in real-time
    socket.on('conversation:pin', ({ conversationId, messageId }: { conversationId: string; messageId: string | null }) => {
      try {
        db.prepare('UPDATE conversations SET pinned_message_id = ? WHERE id = ?').run(messageId || null, conversationId);
        
        let pinnedMessage: any = null;
        if (messageId) {
          const pm = db.prepare(`
            SELECT m.id, m.sender_id, m.text, m.type, m.file_name, m.file_url, m.voice_duration, m.created_at, u.display_name as sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.id = ? AND m.is_deleted = 0
          `).get(messageId) as any;

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

        io.to(`conv_${conversationId}`).emit('conversation:pinned', {
          conversationId,
          pinnedMessageId: messageId || null,
          pinnedMessage,
        });
      } catch (err) {
        console.error('Pin socket error:', err);
      }
    });

    // Handle reaction toggle
    socket.on('message:react', ({ messageId, emoji, conversationId }: { messageId: string; emoji: string; conversationId: string }) => {
      try {
        const existing = db.prepare(`
          SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
        `).get(messageId, userId, emoji) as any;

        if (existing) {
          db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
        } else {
          const reactId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO reactions (id, message_id, user_id, emoji)
            VALUES (?, ?, ?, ?)
          `).run(reactId, messageId, userId, emoji);
        }

        // Get updated reactions for this message
        const reactions = db.prepare(`
          SELECT r.id, r.message_id, r.user_id, r.emoji, u.display_name as user_name
          FROM reactions r
          JOIN users u ON u.id = r.user_id
          WHERE r.message_id = ?
        `).all(messageId) as any[];

        const mappedReactions = reactions.map((r) => ({
          userId: r.user_id,
          userName: r.user_name,
          emoji: r.emoji,
        }));

        io.to(`conv_${conversationId}`).emit('message:reactions_updated', {
          conversationId,
          messageId,
          reactions: mappedReactions,
        });
      } catch (err) {
        console.error('Reaction toggle error:', err);
      }
    });

    // Handle edit message
    socket.on('message:edit', ({ messageId, newText, conversationId }: { messageId: string; newText: string; conversationId: string }) => {
      try {
        const msg = db.prepare('SELECT sender_id, is_deleted FROM messages WHERE id = ?').get(messageId) as any;
        if (!msg || msg.sender_id !== userId || msg.is_deleted) {
          return socket.emit('error', { message: 'Cannot edit this message' });
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE messages SET text = ?, updated_at = ? WHERE id = ?').run(newText.trim(), now, messageId);

        io.to(`conv_${conversationId}`).emit('message:edited', {
          conversationId,
          messageId,
          text: newText.trim(),
          updatedAt: now,
        });
      } catch (err) {
        console.error('Edit message error:', err);
      }
    });

    // Handle delete message
    socket.on('message:delete', ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      try {
        const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId) as any;
        if (!msg || msg.sender_id !== userId) {
          return socket.emit('error', { message: 'Cannot delete this message' });
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE messages SET is_deleted = 1, text = ?, updated_at = ? WHERE id = ?').run('', now, messageId);

        io.to(`conv_${conversationId}`).emit('message:deleted', {
          conversationId,
          messageId,
        });
      } catch (err) {
        console.error('Delete message error:', err);
      }
    });

    // WebRTC Calling signaling events
    socket.on('call:start', ({ conversationId, isVideo }: { conversationId: string; isVideo: boolean }) => {
      try {
        const conv = db.prepare('SELECT is_saved, type FROM conversations WHERE id = ?').get(conversationId) as any;
        if (!conv || conv.is_saved === 1) {
          socket.emit('call:error', { message: 'Нельзя позвонить в Избранное' });
          return;
        }

        const otherMembers = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId) as any[];
        if (otherMembers.length === 0) {
          socket.emit('call:error', { message: 'В чате нет других участников для звонка' });
          return;
        }

        const caller = db.prepare('SELECT display_name, avatar_url FROM users WHERE id = ?').get(userId) as any;
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
    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          const now = new Date().toISOString();
          db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, userId);
          io.emit('user:status', { userId, status: 'offline', lastSeen: now });
        }
      }
    });
  });
}
