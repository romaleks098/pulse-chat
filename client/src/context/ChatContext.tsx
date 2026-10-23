import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User, Conversation, Message } from '../types';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { soundService } from '../services/sound';
import { notificationService } from '../services/notifications';

interface ChatContextType {
  currentUser: User | null;
  token: string | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  onlineUserIds: Set<string>;
  typingUsers: string[];
  loadingMessages: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  login: (credentials: { username: string; password: string }) => Promise<void>;
  loginSocial: (provider: 'telegram' | 'google' | 'github', data: any) => Promise<void>;
  register: (data: { username: string; password: string; displayName: string; avatarUrl?: string }) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { username?: string; displayName?: string; avatarUrl?: string; statusText?: string; bio?: string; themeSettings?: any }) => Promise<void>;
  selectConversation: (id: string | null) => void;
  sendMessage: (data: {
    text: string;
    type?: 'text' | 'image' | 'file' | 'voice';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    voiceDuration?: number;
    replyToId?: string;
  }) => void;
  pinMessage: (messageId: string | null) => Promise<void>;
  openSavedMessages: () => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  editMessage: (messageId: string, newText: string) => void;
  deleteMessage: (messageId: string) => void;
  refreshConversations: () => Promise<void>;
  createDirectChat: (partnerId: string) => Promise<string>;
  createGroupChat: (data: { name: string; avatarUrl?: string; memberIds: string[] }) => Promise<string>;
  createChannel: (data: { name: string; description?: string; avatarUrl?: string }) => Promise<string>;
  togglePinChat: (conversationId: string) => Promise<void>;
  toggleMuteChat: (conversationId: string) => Promise<void>;
  toggleArchiveChat: (conversationId: string) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return localStorage.getItem('pulse_active_conv_id');
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, string>>>({}); // convId -> { userId: name }
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const lastSeqRef = useRef<number>(Number(localStorage.getItem('pulse_last_seq') || 0));
  const serverEpochRef = useRef<string>(localStorage.getItem('pulse_server_epoch') || '');
  const isSyncingRef = useRef<boolean>(false);

  // Load conversations
  const refreshConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [token]);

  // Apply a message event into state
  const applyIncomingMessage = useCallback((newMsg: Message) => {
    if (newMsg.seq) {
      if (lastSeqRef.current > 0 && newMsg.seq > lastSeqRef.current + 1) {
        // Gap detected! Trigger catch-up sync
        syncWithServer();
      }
      lastSeqRef.current = Math.max(lastSeqRef.current, newMsg.seq);
      localStorage.setItem('pulse_last_seq', String(lastSeqRef.current));
    }

    if (newMsg.conversationId === activeConversationIdRef.current) {
      api.markConversationAsRead(newMsg.conversationId).catch(() => {});
    }

    setMessages((prev) => {
      if (newMsg.conversationId === activeConversationIdRef.current) {
        const idx = prev.findIndex(
          (m) => m.id === newMsg.id || (newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId)
        );
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = newMsg;
          return next;
        }
        return [...prev, newMsg];
      }
      return prev;
    });

    setConversations((prev) => {
      const found = prev.find((c) => c.id === newMsg.conversationId);
      if (!found) {
        refreshConversations();
        return prev;
      }

      const isCurrentActive = newMsg.conversationId === activeConversationIdRef.current;
      const updated = prev.map((c) => {
        if (c.id === newMsg.conversationId) {
          const newUnread = isCurrentActive
            ? 0
            : (currentUserRef.current && newMsg.senderId !== currentUserRef.current.id)
            ? (c.unreadCount || 0) + 1
            : c.unreadCount || 0;

          return {
            ...c,
            unreadCount: newUnread,
            lastMessage: {
              id: newMsg.id,
              senderId: newMsg.senderId,
              senderName: newMsg.senderName,
              text: newMsg.text,
              type: newMsg.type,
              fileName: newMsg.fileName,
              createdAt: newMsg.createdAt,
            },
            updatedAt: newMsg.createdAt,
          };
        }
        return c;
      });

      return updated.sort((a, b) => (Number(b.isPinned || 0) - Number(a.isPinned || 0)) || (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    });
  }, [refreshConversations]);

  // Delta synchronization
  const syncWithServer = useCallback(async () => {
    if (!token || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const res = await api.sync(lastSeqRef.current, serverEpochRef.current);
      if (res.fullResyncRequired) {
        serverEpochRef.current = res.epoch;
        lastSeqRef.current = res.latestSeq;
        localStorage.setItem('pulse_server_epoch', res.epoch);
        localStorage.setItem('pulse_last_seq', String(res.latestSeq));
        await refreshConversations();
        const activeId = activeConversationIdRef.current;
        if (activeId) {
          const msgs = await api.getMessages(activeId);
          setMessages(msgs);
        }
      } else if (res.events && res.events.length > 0) {
        for (const evt of res.events) {
          if (evt.eventType === 'message:new') {
            applyIncomingMessage(evt.data);
          } else if (evt.eventType === 'message:edit') {
            setMessages((prev) =>
              prev.map((m) => (m.id === evt.data.messageId ? { ...m, text: evt.data.text, updatedAt: evt.data.updatedAt } : m))
            );
          } else if (evt.eventType === 'message:delete') {
            setMessages((prev) =>
              prev.map((m) => (m.id === evt.data.messageId ? { ...m, isDeleted: true, text: 'Сообщение удалено' } : m))
            );
          } else if (evt.eventType === 'reactions:update') {
            setMessages((prev) =>
              prev.map((m) => (m.id === evt.data.messageId ? { ...m, reactions: evt.data.reactions } : m))
            );
          } else if (evt.eventType === 'conversation:pinned') {
            setConversations((prev) =>
              prev.map((c) => (c.id === evt.data.conversationId ? { ...c, pinnedMessageId: evt.data.pinnedMessageId, pinnedMessage: evt.data.pinnedMessage } : c))
            );
          } else if (evt.eventType === 'conversation:new') {
            refreshConversations();
          } else if (evt.eventType === 'conversation:read') {
            if (currentUserRef.current && evt.data.userId === currentUserRef.current.id) {
              setConversations((prev) =>
                prev.map((c) => (c.id === evt.data.conversationId ? { ...c, unreadCount: 0 } : c))
              );
            }
          }

          if (evt.seq > lastSeqRef.current) {
            lastSeqRef.current = evt.seq;
            localStorage.setItem('pulse_last_seq', String(evt.seq));
          }
        }
      } else if (res.latestSeq > lastSeqRef.current) {
        lastSeqRef.current = res.latestSeq;
        localStorage.setItem('pulse_last_seq', String(res.latestSeq));
      }
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [token, refreshConversations, applyIncomingMessage]);

  // Connection and catch-up triggers
  useEffect(() => {
    const unsub = socketService.onConnectionChange((status) => {
      setConnectionStatus(status);
      if (status === 'connected') {
        syncWithServer();
      }
    });
    return unsub;
  }, [syncWithServer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncWithServer();
      }
    };
    const onFocus = () => {
      syncWithServer();
    };
    const onOnline = () => {
      syncWithServer();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [syncWithServer]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check URL query parameters for OAuth callback token
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Initialize Auth
  useEffect(() => {
    if (token) {
      api.getMe()
        .then((user) => {
          setCurrentUser(user);
          socketService.connect(token);
        })
        .catch(() => {
          logout();
        });
    }
  }, [token]);

  // Socket event listeners
  useEffect(() => {
    if (!currentUser || !token) return;

    // Handle online list
    const unsubOnlineList = socketService.onOnlineUsersList((ids) => {
      setOnlineUserIds(new Set(ids));
    });

    // Handle individual user status
    const unsubUserStatus = socketService.onUserStatus(({ userId, status, lastSeen }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (status === 'online') {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });

      // Update in conversation members
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.partner && conv.partner.id === userId) {
            return {
              ...conv,
              partner: { ...conv.partner, lastSeen },
            };
          }
          return conv;
        })
      );
    });

    // Handle incoming new message
    const unsubNewMessage = socketService.onMessageNew((newMsg) => {
      // Sound and notifications for other users' messages
      if (currentUserRef.current && newMsg.senderId !== currentUserRef.current.id) {
        soundService.playMessageReceived();
        notificationService.show(
          newMsg.senderName,
          newMsg.type === 'voice' ? '🎤 Голосовое сообщение' : (newMsg.text || 'Вложение'),
          newMsg.senderAvatar,
          () => {
            selectConversation(newMsg.conversationId);
          }
        );
      }

      applyIncomingMessage(newMsg);
    });

    // Handle pin update
    const unsubPinned = socketService.onConversationPinned(({ conversationId, pinnedMessageId, pinnedMessage }) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, pinnedMessageId, pinnedMessage } : c))
      );
    });

    // Handle reactions update
    const unsubReactions = socketService.onReactionsUpdated(({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    // Handle message edit
    const unsubEdit = socketService.onMessageEdited(({ messageId, text, updatedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text, updatedAt } : m))
      );
    });

    // Handle message delete
    const unsubDelete = socketService.onMessageDeleted(({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isDeleted: true, text: 'Сообщение удалено' } : m))
      );
    });

    // Handle typing update
    const unsubTyping = socketService.onTypingUpdate(({ conversationId, userId, username, isTyping }) => {
      setTypingMap((prev) => {
        const currentConv = { ...(prev[conversationId] || {}) };
        if (isTyping) {
          currentConv[userId] = username;
        } else {
          delete currentConv[userId];
        }
        return {
          ...prev,
          [conversationId]: currentConv,
        };
      });
    });

    return () => {
      unsubOnlineList();
      unsubUserStatus();
      unsubNewMessage();
      unsubPinned();
      unsubReactions();
      unsubEdit();
      unsubDelete();
      unsubTyping();
    };
  }, [currentUser, token, applyIncomingMessage]);

  // Request notification permission once
  useEffect(() => {
    if (currentUser) {
      notificationService.requestPermission();
    }
  }, [currentUser]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    socketService.joinConversation(activeConversationId);

    api.getMessages(activeConversationId)
      .then((msgs) => {
        setMessages(msgs);
      })
      .catch((err) => {
        console.error('Failed to load messages:', err);
      })
      .finally(() => {
        setLoadingMessages(false);
      });
  }, [activeConversationId]);

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.login(credentials);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
  };

  const loginSocial = async (provider: 'telegram' | 'google' | 'github', data: any) => {
    const res = await api.socialLogin(provider, data);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
  };

  const register = async (data: { username: string; password: string; displayName: string; avatarUrl?: string }) => {
    const res = await api.register(data);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('pulse_active_conv_id');
    localStorage.removeItem('pulse_last_seq');
    localStorage.removeItem('pulse_server_epoch');
    lastSeqRef.current = 0;
    serverEpochRef.current = '';
    setToken(null);
    setCurrentUser(null);
    setActiveConversationId(null);
    setMessages([]);
    socketService.disconnect();
  };

  const updateProfile = async (data: { username?: string; displayName?: string; avatarUrl?: string; statusText?: string; bio?: string; themeSettings?: any }) => {
    const updated = await api.updateProfile(data);
    setCurrentUser(updated);
  };

  const selectConversation = (id: string | null) => {
    setActiveConversationId(id);
    if (id) {
      localStorage.setItem('pulse_active_conv_id', id);
      api.markConversationAsRead(id).catch(() => {});
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
      );
    } else {
      localStorage.removeItem('pulse_active_conv_id');
    }
  };

  const sendMessage = (data: {
    text: string;
    type?: 'text' | 'image' | 'file' | 'voice';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    voiceDuration?: number;
    replyToId?: string;
  }) => {
    if (!activeConversationId || !currentUser) return;
    const clientMessageId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic message for instant UI feedback
    const optimisticMsg: Message = {
      id: clientMessageId,
      clientMessageId,
      conversationId: activeConversationId,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderName: currentUser.displayName || currentUser.username,
      senderAvatar: currentUser.avatarUrl || '',
      text: data.text || '',
      type: data.type || 'text',
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      voiceDuration: data.voiceDuration,
      replyToId: data.replyToId,
      replyTo: data.replyToId ? messages.find((m) => m.id === data.replyToId) : null,
      reactions: [],
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    socketService.sendMessage({
      conversationId: activeConversationId,
      ...data,
      clientMessageId,
    });
    soundService.playMessageSent();
    stopTyping();
  };

  const pinMessage = async (messageId: string | null) => {
    if (!activeConversationId) return;
    try {
      await api.pinMessage(activeConversationId, messageId);
      socketService.pinMessage(activeConversationId, messageId);
    } catch (err) {
      console.error('Failed to pin message:', err);
    }
  };

  const openSavedMessages = async () => {
    try {
      const res = await api.getOrCreateSavedMessages();
      await refreshConversations();
      selectConversation(res.id);
    } catch (err) {
      console.error('Failed to open saved messages:', err);
    }
  };

  const startTyping = () => {
    if (!activeConversationId) return;
    socketService.startTyping(activeConversationId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  };

  const stopTyping = () => {
    if (!activeConversationId) return;
    socketService.stopTyping(activeConversationId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (!activeConversationId) return;
    socketService.toggleReaction(messageId, emoji, activeConversationId);
  };

  const editMessage = (messageId: string, newText: string) => {
    if (!activeConversationId) return;
    socketService.editMessage(messageId, newText, activeConversationId);
  };

  const deleteMessage = (messageId: string) => {
    if (!activeConversationId) return;
    socketService.deleteMessage(messageId, activeConversationId);
  };

  const createDirectChat = async (partnerId: string): Promise<string> => {
    const res = await api.createDirectChat(partnerId);
    await refreshConversations();
    selectConversation(res.id);
    return res.id;
  };

  const createGroupChat = async (data: { name: string; avatarUrl?: string; memberIds: string[] }): Promise<string> => {
    const res = await api.createGroupChat(data);
    await refreshConversations();
    selectConversation(res.id);
    return res.id;
  };

  const createChannel = async (data: { name: string; description?: string; avatarUrl?: string }): Promise<string> => {
    const res = await api.createChannel(data);
    await refreshConversations();
    selectConversation(res.id);
    return res.id;
  };

  const togglePinChat = async (conversationId: string) => {
    try {
      const res = await api.togglePinChat(conversationId);
      setConversations((prev) =>
        prev
          .map((c) => (c.id === conversationId ? { ...c, isPinned: res.isPinned } : c))
          .sort((a, b) => (Number(b.isPinned || 0) - Number(a.isPinned || 0)) || (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
      );
    } catch (err) {
      console.error('Failed to toggle pin chat:', err);
    }
  };

  const toggleMuteChat = async (conversationId: string) => {
    try {
      const res = await api.toggleMuteChat(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, isMuted: res.isMuted } : c))
      );
    } catch (err) {
      console.error('Failed to toggle mute chat:', err);
    }
  };

  const toggleArchiveChat = async (conversationId: string) => {
    try {
      const res = await api.toggleArchiveChat(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, isArchived: res.isArchived } : c))
      );
    } catch (err) {
      console.error('Failed to toggle archive chat:', err);
    }
  };

  const clearConversation = async (conversationId: string) => {
    try {
      await api.clearConversation(conversationId);
      if (activeConversationId === conversationId) {
        setMessages([]);
      }
      await refreshConversations();
    } catch (err) {
      console.error('Failed to clear conversation:', err);
    }
  };

  const markConversationAsRead = async (conversationId: string) => {
    try {
      await api.markConversationAsRead(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to mark conversation as read:', err);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const activeTyping = activeConversationId && typingMap[activeConversationId]
    ? Object.values(typingMap[activeConversationId])
    : [];

  return (
    <ChatContext.Provider
      value={{
        currentUser,
        token,
        conversations,
        activeConversationId,
        activeConversation,
        messages,
        onlineUserIds,
        typingUsers: activeTyping,
        loadingMessages,
        connectionStatus,
        login,
        loginSocial,
        register,
        logout,
        updateProfile,
        selectConversation,
        sendMessage,
        pinMessage,
        openSavedMessages,
        startTyping,
        stopTyping,
        toggleReaction,
        editMessage,
        deleteMessage,
        refreshConversations,
        createDirectChat,
        createGroupChat,
        createChannel,
        togglePinChat,
        toggleMuteChat,
        toggleArchiveChat,
        clearConversation,
        markConversationAsRead,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
