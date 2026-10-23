import { io, Socket } from 'socket.io-client';
import type { Message, Reaction } from '../types';

let socket: Socket | null = null;

export const socketService = {
  connect(token: string): Socket {
    if (socket?.connected) {
      return socket;
    }

    if (socket) {
      socket.disconnect();
    }

    socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected:', socket?.id);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    return socket;
  },

  getSocket(): Socket | null {
    return socket;
  },

  disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },

  joinConversation(conversationId: string) {
    socket?.emit('conversation:join', conversationId);
  },

  sendMessage(data: {
    conversationId: string;
    text: string;
    type?: 'text' | 'image' | 'file';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    replyToId?: string;
  }) {
    socket?.emit('message:send', data);
  },

  startTyping(conversationId: string) {
    socket?.emit('typing:start', { conversationId });
  },

  stopTyping(conversationId: string) {
    socket?.emit('typing:stop', { conversationId });
  },

  toggleReaction(messageId: string, emoji: string, conversationId: string) {
    socket?.emit('message:react', { messageId, emoji, conversationId });
  },

  editMessage(messageId: string, newText: string, conversationId: string) {
    socket?.emit('message:edit', { messageId, newText, conversationId });
  },

  deleteMessage(messageId: string, conversationId: string) {
    socket?.emit('message:delete', { messageId, conversationId });
  },

  onMessageNew(callback: (message: Message) => void) {
    socket?.on('message:new', callback);
    return () => socket?.off('message:new', callback);
  },

  onMessageEdited(callback: (data: { conversationId: string; messageId: string; text: string; updatedAt: string }) => void) {
    socket?.on('message:edited', callback);
    return () => socket?.off('message:edited', callback);
  },

  onMessageDeleted(callback: (data: { conversationId: string; messageId: string }) => void) {
    socket?.on('message:deleted', callback);
    return () => socket?.off('message:deleted', callback);
  },

  onReactionsUpdated(callback: (data: { conversationId: string; messageId: string; reactions: Reaction[] }) => void) {
    socket?.on('message:reactions_updated', callback);
    return () => socket?.off('message:reactions_updated', callback);
  },

  onTypingUpdate(callback: (data: { conversationId: string; userId: string; username: string; isTyping: boolean }) => void) {
    socket?.on('typing:update', callback);
    return () => socket?.off('typing:update', callback);
  },

  onUserStatus(callback: (data: { userId: string; status: 'online' | 'offline'; lastSeen?: string }) => void) {
    socket?.on('user:status', callback);
    return () => socket?.off('user:status', callback);
  },

  onOnlineUsersList(callback: (userIds: string[]) => void) {
    socket?.on('users:online_list', callback);
    return () => socket?.off('users:online_list', callback);
  },

  // Calls
  startCall(conversationId: string, isVideo: boolean) {
    socket?.emit('call:start', { conversationId, isVideo });
  },

  acceptCall(conversationId: string) {
    socket?.emit('call:accept', { conversationId });
  },

  rejectCall(conversationId: string) {
    socket?.emit('call:reject', { conversationId });
  },

  endCall(conversationId: string) {
    socket?.emit('call:end', { conversationId });
  },

  sendCallSignal(conversationId: string, signal: any) {
    socket?.emit('call:signal', { conversationId, signal });
  },

  onCallIncoming(callback: (data: { conversationId: string; callerId: string; callerName: string; callerAvatar: string; isVideo: boolean }) => void) {
    socket?.on('call:incoming', callback);
    return () => socket?.off('call:incoming', callback);
  },

  onCallAccepted(callback: (data: { conversationId: string; accepterId: string }) => void) {
    socket?.on('call:accepted', callback);
    return () => socket?.off('call:accepted', callback);
  },

  onCallRejected(callback: (data: { conversationId: string; rejecterId: string }) => void) {
    socket?.on('call:rejected', callback);
    return () => socket?.off('call:rejected', callback);
  },

  onCallEnded(callback: (data: { conversationId: string; endedBy: string }) => void) {
    socket?.on('call:ended', callback);
    return () => socket?.off('call:ended', callback);
  },

  onCallSignal(callback: (data: { conversationId: string; senderId: string; signal: any }) => void) {
    socket?.on('call:signal', callback);
    return () => socket?.off('call:signal', callback);
  },
};
