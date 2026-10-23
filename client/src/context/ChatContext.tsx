import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User, Conversation, Message } from '../types';
import { api } from '../services/api';
import { socketService } from '../services/socket';

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
  login: (credentials: { username: string; password: string }) => Promise<void>;
  loginSocial: (provider: 'telegram' | 'google' | 'github', data: any) => Promise<void>;
  register: (data: { username: string; password: string; displayName: string; avatarUrl?: string }) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; statusText?: string }) => Promise<void>;
  selectConversation: (id: string | null) => void;
  sendMessage: (data: {
    text: string;
    type?: 'text' | 'image' | 'file';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    replyToId?: string;
  }) => void;
  startTyping: () => void;
  stopTyping: () => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  editMessage: (messageId: string, newText: string) => void;
  deleteMessage: (messageId: string) => void;
  refreshConversations: () => Promise<void>;
  createDirectChat: (partnerId: string) => Promise<string>;
  createGroupChat: (data: { name: string; avatarUrl?: string; memberIds: string[] }) => Promise<string>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, string>>>({}); // convId -> { userId: name }
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (currentUser) {
      refreshConversations();
    }
  }, [currentUser, refreshConversations]);

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
      setMessages((prev) => {
        if (newMsg.conversationId === activeConversationId) {
          // Avoid duplicate
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        }
        return prev;
      });

      // Update conversation in sidebar
      setConversations((prev) => {
        const found = prev.find((c) => c.id === newMsg.conversationId);
        if (!found) {
          refreshConversations();
          return prev;
        }

        const updated = prev.map((c) => {
          if (c.id === newMsg.conversationId) {
            return {
              ...c,
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

        // Sort by updatedAt descending
        return updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
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
      unsubReactions();
      unsubEdit();
      unsubDelete();
      unsubTyping();
    };
  }, [currentUser, token, activeConversationId, refreshConversations]);

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
    setToken(null);
    setCurrentUser(null);
    setActiveConversationId(null);
    setMessages([]);
    socketService.disconnect();
  };

  const updateProfile = async (data: { displayName?: string; avatarUrl?: string; statusText?: string }) => {
    const updated = await api.updateProfile(data);
    setCurrentUser(updated);
  };

  const selectConversation = (id: string | null) => {
    setActiveConversationId(id);
  };

  const sendMessage = (data: {
    text: string;
    type?: 'text' | 'image' | 'file';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    replyToId?: string;
  }) => {
    if (!activeConversationId) return;
    socketService.sendMessage({
      conversationId: activeConversationId,
      ...data,
    });
    stopTyping();
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
    setActiveConversationId(res.id);
    return res.id;
  };

  const createGroupChat = async (data: { name: string; avatarUrl?: string; memberIds: string[] }): Promise<string> => {
    const res = await api.createGroupChat(data);
    await refreshConversations();
    setActiveConversationId(res.id);
    return res.id;
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
        login,
        loginSocial,
        register,
        logout,
        updateProfile,
        selectConversation,
        sendMessage,
        startTyping,
        stopTyping,
        toggleReaction,
        editMessage,
        deleteMessage,
        refreshConversations,
        createDirectChat,
        createGroupChat,
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
