import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { formatChatListTime } from '../utils/format';
import {
  Search,
  Plus,
  Smartphone,
  LogOut,
  Settings,
  Users,
  MessageCircle,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewChat: () => void;
  onOpenPhoneConnect: () => void;
  onOpenProfile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewChat,
  onOpenPhoneConnect,
  onOpenProfile,
}) => {
  const {
    currentUser,
    conversations,
    activeConversationId,
    selectConversation,
    onlineUserIds,
    logout,
  } = useChat();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'group'>('all');

  const filteredConversations = conversations.filter((c) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'direct' && c.type === 'direct') ||
      (filter === 'group' && c.type === 'group');

    const matchesSearch =
      !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessage?.text || '').toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-slate-900 border-r border-slate-800/80 shrink-0 select-none">
      {/* Top Header / Profile Bar */}
      <div className="p-3.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="relative shrink-0">
            <img
              src={currentUser?.avatarUrl}
              alt={currentUser?.displayName}
              className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 object-cover"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate leading-tight">
              {currentUser?.displayName}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {currentUser?.statusText || `@${currentUser?.username}`}
            </div>
          </div>
        </button>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenPhoneConnect}
            title="Подключить телефон (Android)"
            className="p-2 rounded-xl text-indigo-400 hover:text-white hover:bg-indigo-600/20 transition-colors"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNewChat}
            title="Новый диалог / группа"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenProfile}
            title="Настройки профиля"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            title="Выйти"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск чатов и сообщений..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-all"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pb-2 flex gap-1">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          Все ({conversations.length})
        </button>
        <button
          onClick={() => setFilter('direct')}
          className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
            filter === 'direct'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          Личные
        </button>
        <button
          onClick={() => setFilter('group')}
          className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
            filter === 'group'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          Группы
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isPartnerOnline = conv.type === 'direct' && conv.partner && onlineUserIds.has(conv.partner.id);

            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'hover:bg-slate-800/50 text-slate-300'
                }`}
              >
                {/* Avatar with status */}
                <div className="relative shrink-0">
                  <img
                    src={conv.avatarUrl}
                    alt={conv.name}
                    className="w-12 h-12 rounded-full bg-slate-800 object-cover border border-slate-700/50"
                  />
                  {conv.type === 'direct' ? (
                    <span
                      className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${
                        isActive ? 'border-indigo-600' : 'border-slate-900'
                      } ${isPartnerOnline ? 'bg-emerald-400' : 'bg-slate-500'}`}
                      title={isPartnerOnline ? 'В сети' : 'Не в сети'}
                    />
                  ) : (
                    <span
                      className={`absolute bottom-0 right-0 p-0.5 rounded-full ${
                        isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Info & Last message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isActive ? 'text-white' : 'text-slate-200'
                      }`}
                    >
                      {conv.name}
                    </span>
                    {conv.lastMessage && (
                      <span
                        className={`text-[10px] shrink-0 ${
                          isActive ? 'text-indigo-200' : 'text-slate-500'
                        }`}
                      >
                        {formatChatListTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>

                  <div
                    className={`text-xs truncate flex items-center gap-1 ${
                      isActive ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    {conv.lastMessage ? (
                      <>
                        {conv.type === 'group' && (
                          <span className="font-medium text-slate-300">
                            {conv.lastMessage.senderName}:
                          </span>
                        )}
                        {conv.lastMessage.type === 'image' ? (
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" /> Фото
                          </span>
                        ) : conv.lastMessage.type === 'file' ? (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" /> Файл
                          </span>
                        ) : (
                          <span>{conv.lastMessage.text}</span>
                        )}
                      </>
                    ) : (
                      <span className="italic opacity-60">Пока нет сообщений</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center">
            <MessageCircle className="w-8 h-8 opacity-30 mb-2" />
            <span>Чатов не найдено</span>
            <button
              onClick={onOpenNewChat}
              className="mt-3 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs rounded-xl transition-colors"
            >
              Начать переписку
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
