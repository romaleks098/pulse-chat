import React, { useState, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { api } from '../services/api';
import type { User } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import {
  Search,
  Users,
  Radio,
  User as UserIcon,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const { createDirectChat, createGroupChat, createChannel } = useChat();

  const [tab, setTab] = useState<'direct' | 'group' | 'channel'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group state
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Channel state
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      api.searchUsers(searchQuery)
        .then((users) => setSearchResults(users))
        .catch((err) => {
          console.error('Search error:', err);
          setError('Ошибка при поиске пользователей');
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset fields on close or open
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setGroupName('');
      setSelectedUsers([]);
      setChannelName('');
      setChannelDescription('');
      setError(null);
    }
  }, [isOpen]);

  const handleStartDirect = async (user: User) => {
    try {
      await createDirectChat(user.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось начать чат');
    }
  };

  const handleToggleUserSelection = (user: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setCreatingGroup(true);
    setError(null);
    try {
      await createGroupChat({
        name: groupName.trim(),
        memberIds: selectedUsers.map((u) => u.id),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания группы');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;

    setCreatingChannel(true);
    setError(null);
    try {
      await createChannel({
        name: channelName.trim(),
        description: channelDescription.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания канала');
    } finally {
      setCreatingChannel(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Новое общение"
      subtitle="Начните личный диалог, создайте группу или канал"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Tab switcher */}
        <div className="flex p-1 bg-black/20 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => { setTab('direct'); setError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'direct'
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Личный диалог</span>
          </button>

          <button
            type="button"
            onClick={() => { setTab('group'); setError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'group'
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Группа</span>
          </button>

          <button
            type="button"
            onClick={() => { setTab('channel'); setError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'channel'
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Канал</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Direct Chat */}
        {tab === 'direct' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени или @username..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {searching ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--accent-default,#6366f1)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleStartDirect(user)}
                    className="p-2 rounded-xl flex items-center gap-3 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <Avatar
                      src={user.avatarUrl}
                      name={user.displayName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[var(--text-primary,#f8fafc)] truncate">
                        {user.displayName}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary,#94a3b8)] truncate">
                        @{user.username}
                      </div>
                    </div>
                  </div>
                ))
              ) : searchQuery ? (
                <div className="py-8 text-center text-xs text-[var(--text-secondary,#94a3b8)]">
                  Пользователи не найдены
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--text-muted,#64748b)]">
                  Введите имя или никнейм для поиска собеседника
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Group Chat */}
        {tab === 'group' && (
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
                Название группы
              </label>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Например: Рабочий проект, Друзья..."
                className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
              />
            </div>

            {/* Selected members chips */}
            {selectedUsers.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
                  Участники ({selectedUsers.length})
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent-default,#6366f1)] rounded-lg text-xs font-medium border border-[var(--accent-default,#6366f1)]/20"
                    >
                      <span className="truncate max-w-[120px]">{u.displayName}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleUserSelection(u)}
                        className="hover:text-rose-400 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* User search for group */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
                Добавить участников
              </label>
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск пользователей..."
                  className="w-full pl-9 pr-3 py-1.5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {searchResults.map((user) => {
                  const isSelected = selectedUsers.some((u) => u.id === user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => handleToggleUserSelection(user)}
                      className={`p-2 rounded-xl flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-[var(--accent-subtle,rgba(99,102,241,0.15))]' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary,#f8fafc)] truncate">
                            {user.displayName}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary,#94a3b8)]">
                            @{user.username}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent-default,#6366f1)] border-[var(--accent-default,#6366f1)] text-white'
                            : 'border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
              <Button type="button" variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" loading={creatingGroup} disabled={!groupName.trim()}>
                Создать группу
              </Button>
            </div>
          </form>
        )}

        {/* Tab 3: Channel */}
        {tab === 'channel' && (
          <form onSubmit={handleCreateChannel} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
                Название канала
              </label>
              <input
                type="text"
                required
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Например: Новости команды, Блог..."
                className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
                Описание канала (необязательно)
              </label>
              <textarea
                rows={3}
                value={channelDescription}
                onChange={(e) => setChannelDescription(e.target.value)}
                placeholder="Расскажите о содержании вашего канала..."
                className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] resize-none transition-colors"
              />
            </div>

            <p className="text-[11px] text-[var(--text-secondary,#94a3b8)] leading-relaxed">
              📢 Каналы — инструмент для трансляции сообщений неограниченной аудитории. Публиковать сообщения могут только администраторы.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
              <Button type="button" variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" loading={creatingChannel} disabled={!channelName.trim()}>
                Создать канал
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
