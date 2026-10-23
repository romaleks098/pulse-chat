import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User, Conversation, Message, SessionInfo } from '../types';
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
  sessions: SessionInfo[];
  loadSessions: () => Promise<void>;
  revokeSession: (id: string) => Promise<void>;
  revokeAllOtherSessions: () => Promise<void>;
  onlineUserIds: Set<string>;
  typingUsers: string[];
  typingMap: Record<string, Record<string, string>>;
  loadingMessages: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  isAuthInitializing: boolean;
  applyAuthenticatedSession: (data: { token: string; refreshToken?: string; user: any }) => Promise<void>;
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
  forwardMessage: (msg: Message, targetConversationId: string) => Promise<void>;
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
  deleteConversation: (conversationId: string) => Promise<void>;
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
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, string>>>({}); // convId -> { userId: name }
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(Boolean(token));

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

  // Load conversations whenever authenticated user is active
  useEffect(() => {
    if (currentUser && token) {
      refreshConversations();
    }
  }, [currentUser, token, refreshConversations]);

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
      } else {
        setConversations((prev) => {
          if (prev.length === 0) {
            refreshConversations();
          }
          return prev;
        });

        if (res.events && res.events.length > 0) {
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
        }
        if (res.latestSeq > lastSeqRef.current) {
          lastSeqRef.current = res.latestSeq;
          localStorage.setItem('pulse_last_seq', String(res.latestSeq));
        }
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

  // Check URL query parameters for OAuth callback (PKCE code exchange, cookie auth, or legacy token)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const codeVerifier = sessionStorage.getItem('pulse_pkce_verifier');

    if (code && codeVerifier) {
      setIsAuthInitializing(true);
      const redirectUri = `${window.location.origin}/`;
      api.exchangeAuthCode(code, codeVerifier, redirectUri)
        .then((res) => {
          sessionStorage.removeItem('pulse_pkce_verifier');
          sessionStorage.removeItem('pulse_pkce_state');
          setToken(res.token);
          setCurrentUser(res.user);
          socketService.connect(res.token);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          console.error('PKCE exchange error:', err);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => {
          setIsAuthInitializing(false);
        });
    } else if (urlParams.get('auth') === 'success') {
      setIsAuthInitializing(true);
      api.refreshSession()
        .then((res) => {
          setToken(res.token);
          setCurrentUser(res.user);
          socketService.connect(res.token);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => {
          setIsAuthInitializing(false);
        });
    } else if (urlParams.get('token')) {
      const urlToken = urlParams.get('token');
      if (urlToken) {
        localStorage.setItem('token', urlToken);
        setToken(urlToken);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Initialize Auth with cold-start retry
  useEffect(() => {
    if (!token) {
      setIsAuthInitializing(false);
      return;
    }

    let isCancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchUser = async (attempt = 1) => {
      try {
        setConnectionStatus('connecting');
        const user = await api.getMe();
        if (isCancelled) return;
        setCurrentUser(user);
        setIsAuthInitializing(false);
        setConnectionStatus('connected');
        socketService.connect(token);
        refreshConversations();
      } catch (err: any) {
        if (isCancelled) return;
        // If explicitly unauthorized (expired or revoked token), log out
        if (err.status === 401 || err.status === 403) {
          setIsAuthInitializing(false);
          logout();
          return;
        }

        // If server is cold starting or network is momentarily unavailable, retry without logging out!
        setConnectionStatus('connecting');
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 5000);
        console.log(`[PulseChat] Server cold start/connecting, retrying in ${delay}ms (attempt ${attempt})...`);
        retryTimer = setTimeout(() => {
          fetchUser(attempt + 1);
        }, delay);
      }
    };

    fetchUser();

    return () => {
      isCancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
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

  // Load messages when active conversation changes or auth completes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    if (!token || !currentUser) {
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
  }, [activeConversationId, currentUser, token]);

  // If conversations loaded and stored activeConversationId is not among them, adjust selection
  useEffect(() => {
    if (conversations.length > 0 && activeConversationId) {
      const exists = conversations.some((c) => c.id === activeConversationId);
      if (!exists) {
        const saved = conversations.find((c) => c.isSaved);
        if (saved) {
          selectConversation(saved.id);
        } else {
          selectConversation(null);
        }
      }
    }
  }, [conversations, activeConversationId]);

  const applyAuthenticatedSession = useCallback(async (res: { token: string; refreshToken?: string; user: any }) => {
    localStorage.setItem('token', res.token);
    if (res.refreshToken) {
      localStorage.setItem('pulse_refresh_token', res.refreshToken);
    }
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
    await refreshConversations();
  }, [refreshConversations]);

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.login(credentials);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
    await refreshConversations();
  };

  const loginSocial = async (provider: 'telegram' | 'google' | 'github', data: any) => {
    const res = await api.socialLogin(provider, data);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
    await refreshConversations();
  };

  const register = async (data: { username: string; password: string; displayName: string; avatarUrl?: string }) => {
    const res = await api.register(data);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
    socketService.connect(res.token);
    await refreshConversations();
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('pulse_refresh_token');
    localStorage.removeItem('pulse_active_conv_id');
    localStorage.removeItem('pulse_last_seq');
    localStorage.removeItem('pulse_server_epoch');
    lastSeqRef.current = 0;
    serverEpochRef.current = '';
    setToken(null);
    setCurrentUser(null);
    setActiveConversationId(null);
    setMessages([]);
    setSessions([]);
    socketService.disconnect();
  };

  // Silently refresh access token every 10 minutes
  useEffect(() => {
    if (!currentUser || !token) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.refreshSession();
        setToken(res.token);
      } catch (err: any) {
        if (err.tokenReused || err.status === 401) {
          logout();
        }
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentUser, token]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  const revokeSession = async (sessionId: string) => {
    try {
      await api.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to revoke session:', err);
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      await api.revokeAllOtherSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err) {
      console.error('Failed to revoke other sessions:', err);
    }
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

  const forwardMessage = async (msg: Message, targetConversationId: string) => {
    if (!currentUser || !targetConversationId) return;
    const clientMessageId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const forwardHeader = `↪️ Переслано от ${msg.senderName}:\n`;
    const textToSend = msg.text ? `${forwardHeader}${msg.text}` : forwardHeader;

    if (activeConversationId === targetConversationId) {
      const optimisticMsg: Message = {
        id: clientMessageId,
        clientMessageId,
        conversationId: targetConversationId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderName: currentUser.displayName || currentUser.username,
        senderAvatar: currentUser.avatarUrl || '',
        text: textToSend,
        type: msg.type || 'text',
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        voiceDuration: msg.voiceDuration,
        reactions: [],
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimisticMsg]);
    }

    socketService.sendMessage({
      conversationId: targetConversationId,
      text: textToSend,
      type: msg.type || 'text',
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      voiceDuration: msg.voiceDuration,
      clientMessageId,
    });

    soundService.playMessageSent();
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
    const existing = conversations.find((c) => c.isSaved);
    if (existing) {
      selectConversation(existing.id);
      return;
    }
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

  const deleteConversation = async (conversationId: string) => {
    try {
      await api.deleteConversation(conversationId);
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        localStorage.removeItem('pulse_active_conv_id');
        setMessages([]);
      }
      await refreshConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
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
        sessions,
        loadSessions,
        revokeSession,
        revokeAllOtherSessions,
        onlineUserIds,
        typingUsers: activeTyping,
        typingMap,
        loadingMessages,
        connectionStatus,
        isAuthInitializing,
        applyAuthenticatedSession,
        login,
        loginSocial,
        register,
        logout,
        updateProfile,
        selectConversation,
        sendMessage,
        forwardMessage,
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
        deleteConversation,
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
