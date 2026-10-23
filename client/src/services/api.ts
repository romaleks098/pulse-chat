import type { User, Conversation, Message, NetworkInfo, SessionInfo } from '../types';
import { API_BASE } from '../config';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('pulse_refresh_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
  };
}

export const api = {
  // Auth
  async register(data: { username: string; password: string; displayName: string; avatarUrl?: string }) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка при регистрации');
    }
    const result = await res.json();
    if (result.token) localStorage.setItem('token', result.token);
    if (result.refreshToken) localStorage.setItem('pulse_refresh_token', result.refreshToken);
    return result as { token: string; refreshToken?: string; user: User };
  },

  async login(data: { username: string; password: string }) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Неверный логин или пароль');
    }
    const result = await res.json();
    if (result.token) localStorage.setItem('token', result.token);
    if (result.refreshToken) localStorage.setItem('pulse_refresh_token', result.refreshToken);
    return result as { token: string; refreshToken?: string; user: User };
  },

  async socialLogin(provider: 'telegram' | 'google' | 'github', data: any) {
    const res = await fetch(`${API_BASE}/auth/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка входа через социальную сеть');
    }
    const result = await res.json();
    if (result.token) localStorage.setItem('token', result.token);
    if (result.refreshToken) localStorage.setItem('pulse_refresh_token', result.refreshToken);
    return result as { token: string; refreshToken?: string; user: User };
  },

  async refreshSession(): Promise<{ token: string; refreshToken?: string; user: User }> {
    const refreshToken = localStorage.getItem('pulse_refresh_token');
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken: refreshToken || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.error || 'Сессия истекла');
      (error as any).status = res.status;
      (error as any).tokenReused = err.tokenReused;
      throw error;
    }
    const result = await res.json();
    if (result.token) localStorage.setItem('token', result.token);
    if (result.refreshToken) localStorage.setItem('pulse_refresh_token', result.refreshToken);
    return result;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('pulse_refresh_token');
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ refreshToken: refreshToken || undefined }),
    }).catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('pulse_refresh_token');
  },

  async getSessions(): Promise<SessionInfo[]> {
    const res = await fetch(`${API_BASE}/auth/sessions`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Не удалось загрузить список устройств');
    return res.json();
  },

  async revokeSession(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Не удалось отозвать сессию');
  },

  async revokeAllOtherSessions(): Promise<{ count: number }> {
    const res = await fetch(`${API_BASE}/auth/sessions`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Не удалось завершить другие сессии');
    return res.json();
  },

  async exchangeAuthCode(code: string, codeVerifier: string, redirectUri: string) {
    const res = await fetch(`${API_BASE}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка обмена кода авторизации');
    }
    const result = await res.json();
    if (result.token) localStorage.setItem('token', result.token);
    if (result.refreshToken) localStorage.setItem('pulse_refresh_token', result.refreshToken);
    return result as { token: string; refreshToken?: string; user: User };
  },

  async createTelegramBotSession(codeChallenge?: string, codeChallengeMethod?: string, redirectUri?: string, state?: string) {
    const res = await fetch(`${API_BASE}/auth/telegram/bot/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        redirect_uri: redirectUri,
        state,
      }),
    });
    if (!res.ok) throw new Error('Не удалось создать сессию Telegram бота');
    return res.json() as Promise<{ token: string; botName: string; deepLink: string; expiresInSeconds: number }>;
  },

  async checkTelegramBotSession(token: string) {
    const res = await fetch(`${API_BASE}/auth/telegram/bot/check?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('Не удалось проверить статус сессии');
    return res.json() as Promise<{ status: 'pending' | 'completed' | 'expired'; code: string | null; user: any | null }>;
  },

  async getAuthProviders(): Promise<{ telegramBotName: string; googleClientId: string; githubClientId: string }> {
    const res = await fetch(`${API_BASE}/auth/providers`);
    if (!res.ok) return { telegramBotName: '', googleClientId: '', githubClientId: '' };
    return res.json();
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (res.status === 401 || res.status === 403) {
      // Try transparent refresh!
      try {
        const refreshed = await this.refreshSession();
        return refreshed.user;
      } catch {
        const err = new Error('Unauthorized');
        (err as any).status = 401;
        throw err;
      }
    }
    if (!res.ok) {
      const err = new Error(`Server status: ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json();
  },

  async updateProfile(data: { username?: string; displayName?: string; avatarUrl?: string; statusText?: string; bio?: string; themeSettings?: any }): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось обновить профиль');
    }
    return res.json();
  },

  // Users
  async searchUsers(query: string): Promise<User[]> {
    if (!query.trim()) return [];
    const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Ошибка поиска пользователей');
    return res.json();
  },

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    const res = await fetch(`${API_BASE}/conversations`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось загрузить чаты');
    return res.json();
  },

  async createDirectChat(partnerId: string): Promise<{ id: string; isNew: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/direct`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ partnerId }),
    });
    if (!res.ok) throw new Error('Не удалось создать диалог');
    return res.json();
  },

  async createGroupChat(data: { name: string; avatarUrl?: string; memberIds: string[] }): Promise<{ id: string; isNew: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/group`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Не удалось создать группу');
    return res.json();
  },

  async getMessages(conversationId: string, before?: string): Promise<Message[]> {
    const url = new URL(`${API_BASE}/conversations/${conversationId}/messages`, window.location.origin);
    if (before) url.searchParams.set('before', before);
    
    const token = localStorage.getItem('token');
    const res = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Не удалось загрузить сообщения');
    return res.json();
  },

  // File Upload
  async uploadFile(file: File | Blob, customName?: string): Promise<{ url: string; fileName: string; fileSize: number; mimeType: string; type: 'image' | 'file' }> {
    const formData = new FormData();
    const finalFile = file instanceof File ? file : new File([file], customName || 'voice_message.webm', { type: file.type });
    formData.append('file', finalFile);

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error('Ошибка загрузки файла');
    return res.json();
  },

  // Saved messages & Pinned
  async getOrCreateSavedMessages(): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/conversations/saved`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось открыть избранное');
    return res.json();
  },

  async pinMessage(conversationId: string, messageId: string | null): Promise<any> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/pin`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messageId }),
    });
    if (!res.ok) throw new Error('Не удалось закрепить сообщение');
    return res.json();
  },

  async searchMessages(conversationId: string, query: string): Promise<Message[]> {
    if (!query.trim()) return [];
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/search?q=${encodeURIComponent(query.trim())}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  // Conversation Actions
  async markConversationAsRead(conversationId: string): Promise<void> {
    await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },

  async togglePinChat(conversationId: string): Promise<{ success: boolean; isPinned: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/pin-chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  async toggleMuteChat(conversationId: string): Promise<{ success: boolean; isMuted: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/mute`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  async toggleArchiveChat(conversationId: string): Promise<{ success: boolean; isArchived: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/archive`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  async clearConversation(conversationId: string): Promise<void> {
    await fetch(`${API_BASE}/conversations/${conversationId}/clear`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await fetch(`${API_BASE}/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  },

  async createChannel(data: { name: string; description?: string; avatarUrl?: string }): Promise<{ id: string; isNew: boolean }> {
    const res = await fetch(`${API_BASE}/conversations/channel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать канал');
    }
    return res.json();
  },

  // Network & QR Info
  async getNetworkInfo(): Promise<NetworkInfo> {
    const res = await fetch(`${API_BASE}/network/info`);
    if (!res.ok) throw new Error('Не удалось получить сетевую информацию');
    return res.json();
  },

  // Real-time delta sync
  async sync(since: number, epoch: string | null): Promise<{
    fullResyncRequired: boolean;
    epoch: string;
    latestSeq: number;
    events: {
      seq: number;
      conversationId: string;
      eventType: string;
      data: any;
      createdAt: string;
    }[];
  }> {
    const query = new URLSearchParams();
    query.set('since', String(since || 0));
    if (epoch) query.set('epoch', epoch);

    const res = await fetch(`${API_BASE}/sync?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Sync request failed');
    return res.json();
  },
};
