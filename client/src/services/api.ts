import type { User, Conversation, Message, NetworkInfo } from '../types';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const api = {
  // Auth
  async register(data: { username: string; password: string; displayName: string; avatarUrl?: string }) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ошибка при регистрации');
    }
    return res.json() as Promise<{ token: string; user: User }>;
  },

  async login(data: { username: string; password: string }) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Неверный логин или пароль');
    }
    return res.json() as Promise<{ token: string; user: User }>;
  },

  async socialLogin(provider: 'telegram' | 'google' | 'github', data: any) {
    const res = await fetch(`${API_BASE}/auth/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, data }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ошибка входа через социальную сеть');
    }
    return res.json() as Promise<{ token: string; user: User }>;
  },

  async getAuthProviders(): Promise<{ telegramBotName: string; googleClientId: string; githubClientId: string }> {
    const res = await fetch(`${API_BASE}/auth/providers`);
    if (!res.ok) return { telegramBotName: '', googleClientId: '', githubClientId: '' };
    return res.json();
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Не авторизован');
    return res.json();
  },

  async updateProfile(data: { displayName?: string; avatarUrl?: string; statusText?: string }): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Не удалось обновить профиль');
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
    const url = new URL(`${window.location.origin}${API_BASE}/conversations/${conversationId}/messages`);
    if (before) url.searchParams.set('before', before);
    
    const token = localStorage.getItem('token');
    const res = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Не удалось загрузить сообщения');
    return res.json();
  },

  // File Upload
  async uploadFile(file: File): Promise<{ url: string; fileName: string; fileSize: number; mimeType: string; type: 'image' | 'file' }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error('Ошибка загрузки файла');
    return res.json();
  },

  // Network & QR Info
  async getNetworkInfo(): Promise<NetworkInfo> {
    const res = await fetch(`${API_BASE}/network/info`);
    if (!res.ok) throw new Error('Не удалось получить сетевую информацию');
    return res.json();
  },
};
