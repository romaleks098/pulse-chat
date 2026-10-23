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
  Bookmark,
  Mic,
  Pin,
  VolumeX,
  Radio,
  WifiOff,
  AlertCircle,
  X,
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
    openSavedMessages,
    onlineUserIds,
    connectionStatus,
    logout,
  } = useChat();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'group' | 'channel'>(() => {
    return (localStorage.getItem('pulse_chat_filter') as any) || 'all';
  });
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleFilterChange = (nextFilter: 'all' | 'direct' | 'group' | 'channel') => {
    setFilter(nextFilter);
    localStorage.setItem('pulse_chat_filter', nextFilter);
  };

  // Find saved messages conversation
  const savedConv = conversations.find((c) => c.isSaved);
  const otherConversations = conversations.filter((c) => !c.isSaved);

  // Filter conversations
  const filteredConversations = otherConversations.filter((c) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'direct' && c.type === 'direct' && !c.isChannel) ||
      (filter === 'group' && c.type === 'group' && !c.isChannel) ||
      (filter === 'channel' && c.isChannel);

    const matchesSearch =
      !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessage?.text || '').toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Calculate unread counters for each folder tab
  const unreadAll = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unreadDirect = otherConversations
    .filter((c) => c.type === 'direct' && !c.isChannel)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unreadGroup = otherConversations
    .filter((c) => c.type === 'group' && !c.isChannel)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unreadChannel = otherConversations
    .filter((c) => c.isChannel)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Should show Saved Messages row
  const showSavedInList =
    (filter === 'all' || filter === 'direct') &&
    (!search.trim() ||
      'избранное'.includes(search.toLowerCase()) ||
      'заметки'.includes(search.toLowerCase()) ||
      (savedConv?.lastMessage?.text || '').toLowerCase().includes(search.toLowerCase()));

  const isSavedActive = savedConv ? activeConversationId === savedConv.id : false;

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-slate-900 border-r border-slate-800/80 shrink-0 select-none">
      {/* Network connection warning banner */}
      {connectionStatus !== 'connected' && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-3 py-1 text-[11px] text-amber-300 flex items-center justify-center gap-1.5 shrink-0 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          <span>{connectionStatus === 'connecting' ? 'Подключение к сети...' : 'Нет соединения с сервером'}</span>
        </div>
      )}

      {/* Top Header / Profile Bar */}
      <div className="p-3.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3">
        <button
          onClick={onOpenProfile}
          aria-label="Профиль пользователя"
          className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition-opacity"
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
            aria-label="Подключить телефон (Android)"
            className="p-2 rounded-xl text-indigo-400 hover:text-white hover:bg-indigo-600/20 transition-colors"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNewChat}
            title="Новый диалог / группа"
            aria-label="Новый диалог или группа"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenProfile}
            title="Настройки профиля"
            aria-label="Настройки профиля"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            title="Выйти"
            aria-label="Выйти"
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
            className="w-full pl-9 pr-8 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs with Telegram-style unread badges */}
      <div className="px-3 pb-2 flex gap-1">
        <button
          onClick={() => handleFilterChange('all')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            filter === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>Все</span>
          {unreadAll > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === 'all' ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-white'
            }`}>
              {unreadAll}
            </span>
          )}
        </button>

        <button
          onClick={() => handleFilterChange('direct')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            filter === 'direct'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>Личные</span>
          {unreadDirect > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === 'direct' ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-white'
            }`}>
              {unreadDirect}
            </span>
          )}
        </button>

        <button
          onClick={() => handleFilterChange('group')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            filter === 'group'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>Группы</span>
          {unreadGroup > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === 'group' ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-white'
            }`}>
              {unreadGroup}
            </span>
          )}
        </button>

        <button
          onClick={() => handleFilterChange('channel')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            filter === 'channel'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>Каналы</span>
          {unreadChannel > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === 'channel' ? 'bg-white text-indigo-700' : 'bg-indigo-500 text-white'
            }`}>
              {unreadChannel}
            </span>
          )}
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {/* Single Saved Messages row (pinned top in 'all' / 'direct') */}
        {showSavedInList && (
          <div
            onClick={openSavedMessages}
            className={`p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all mb-1 ${
              isSavedActive
                ? 'bg-indigo-600 text-white shadow-md'
                : 'hover:bg-slate-800/60 text-slate-300 bg-indigo-500/5 border border-indigo-500/10'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <Bookmark className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className={`text-sm font-semibold truncate ${isSavedActive ? 'text-white' : 'text-slate-100'}`}>
                  Избранное
                </span>
                {savedConv?.lastMessage && (
                  <span className={`text-[10px] shrink-0 ${isSavedActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {formatChatListTime(savedConv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <p className={`text-xs truncate ${isSavedActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                {savedConv?.lastMessage?.text || 'Ваши заметки и файлы'}
              </p>
            </div>
          </div>
        )}

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
                {/* Avatar with status indicator */}
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
                  ) : conv.isChannel ? (
                    <span
                      className={`absolute bottom-0 right-0 p-0.5 rounded-full ${
                        isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-indigo-400'
                      }`}
                      title="Канал"
                    >
                      <Radio className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span
                      className={`absolute bottom-0 right-0 p-0.5 rounded-full ${
                        isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                      title="Группа"
                    >
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Info & Last message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isActive ? 'text-white' : 'text-slate-100'
                        }`}
                      >
                        {conv.name}
                      </span>
                      {conv.isMuted && (
                        <VolumeX className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {conv.isPinned && (
                        <Pin className="w-3 h-3 text-indigo-300 rotate-45 shrink-0" />
                      )}
                      {conv.lastMessage && (
                        <span
                          className={`text-[10px] ${
                            isActive ? 'text-indigo-200' : 'text-slate-400'
                          }`}
                        >
                          {formatChatListTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`text-xs truncate flex items-center gap-1 flex-1 ${
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
                          ) : conv.lastMessage.type === 'voice' ? (
                            <span className="flex items-center gap-1 text-indigo-400">
                              <Mic className="w-3.5 h-3.5" /> Голосовое
                            </span>
                          ) : (
                            <span>{conv.lastMessage.text}</span>
                          )}
                        </>
                      ) : (
                        <span className="italic opacity-60">Пока нет сообщений</span>
                      )}
                    </div>

                    {/* Unread badge */}
                    {conv.unreadCount && conv.unreadCount > 0 ? (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          conv.isMuted
                            ? 'bg-slate-700 text-slate-300'
                            : isActive
                            ? 'bg-white text-indigo-700'
                            : 'bg-indigo-500 text-white'
                        }`}
                      >
                        {conv.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        ) : !showSavedInList ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <MessageCircle className="w-8 h-8 opacity-40 mb-2" />
            <span>Чатов не найдено</span>
            <button
              onClick={onOpenNewChat}
              className="mt-3 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs rounded-xl transition-colors cursor-pointer"
            >
              Начать переписку
            </button>
          </div>
        ) : null}
      </div>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Выйти из аккаунта?</h3>
                <p className="text-xs text-slate-400">Вам потребуется повторно войти в PulseChat</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  logout();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer shadow-lg shadow-rose-600/30"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};