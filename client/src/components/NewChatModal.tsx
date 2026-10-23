import React, { useState, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { api } from '../services/api';
import type { User } from '../types';
import { X, Search, UserPlus, Users, Check, MessageSquarePlus } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const { createDirectChat, createGroupChat } = useChat();
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Group state
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      api.searchUsers(searchQuery)
        .then((users) => setSearchResults(users))
        .catch((err) => console.error('Search error:', err))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleStartDirect = async (user: User) => {
    try {
      await createDirectChat(user.id);
      onClose();
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  const handleToggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setCreatingGroup(true);
    try {
      await createGroupChat({
        name: groupName.trim(),
        memberIds: selectedUserIds,
      });
      onClose();
    } catch (err) {
      console.error('Create group error:', err);
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-200 flex flex-col max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <MessageSquarePlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Новый чат</h2>
            <p className="text-xs text-slate-400">Начните диалог или создайте группу</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-950/60 rounded-xl mb-4 border border-slate-800">
          <button
            type="button"
            onClick={() => setTab('direct')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === 'direct' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Личный диалог</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('group')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === 'group' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Групповой канал</span>
          </button>
        </div>

        {tab === 'direct' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search input */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени или логину..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            {/* User results */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[160px]">
              {searching ? (
                <div className="py-8 text-center text-xs text-slate-500">Поиск пользователей...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleStartDirect(user)}
                    className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 flex items-center gap-3 transition-colors text-left group"
                  >
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors truncate">
                        {user.displayName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">@{user.username}</div>
                    </div>
                    <span className="text-xs text-indigo-400 font-medium px-2 py-1 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-all">
                      Написать
                    </span>
                  </button>
                ))
              ) : searchQuery ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Пользователей не найдено
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  Введите логин или имя пользователя для поиска
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateGroup} className="flex flex-col flex-1 overflow-hidden">
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Название группы
              </label>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Например: Команда разработки"
                className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            <div className="mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Добавить участников (необязательно)
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Найти пользователей..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-[120px] max-h-[180px]">
              {searchResults.map((user) => {
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleToggleUserSelection(user.id)}
                    className={`p-2 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={user.avatarUrl}
                        alt={user.displayName}
                        className="w-8 h-8 rounded-full bg-slate-800"
                      />
                      <div>
                        <div className="text-xs font-medium text-white">{user.displayName}</div>
                        <div className="text-[10px] text-slate-400">@{user.username}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={creatingGroup || !groupName.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {creatingGroup ? 'Создание...' : 'Создать группу'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
