import React, { useState, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { formatChatListTime } from '../utils/format';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';
import type { Conversation } from '../types';
import {
  Menu,
  Search,
  Plus,
  Smartphone,
  LogOut,
  MessageCircle,
  Image as ImageIcon,
  FileText,
  Bookmark,
  Mic,
  Pin,
  PinOff,
  VolumeX,
  Volume2,
  CheckCheck,
  WifiOff,
  AlertCircle,
  X,
  User,
  Moon,
  Sun,
  Palette,
  Trash2,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewChat: () => void;
  onOpenPhoneConnect: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewChat,
  onOpenPhoneConnect,
  onOpenProfile,
  onOpenSettings,
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
    togglePinChat,
    toggleMuteChat,
    clearConversation,
    markConversationAsRead,
  } = useChat();

  const { settings, setSidebarWidth, resolvedTheme, setThemePreset } = useTheme();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'group' | 'channel'>(() => {
    return (localStorage.getItem('pulse_chat_filter') as any) || 'all';
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Context Menu state
  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    targetConv: Conversation | null;
  }>({
    isOpen: false,
    position: null,
    targetConv: null,
  });

  const handleFilterChange = (nextFilter: 'all' | 'direct' | 'group' | 'channel') => {
    setFilter(nextFilter);
    localStorage.setItem('pulse_chat_filter', nextFilter);
  };

  // Resizing logic for desktop
  const isResizingRef = useRef(false);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.min(Math.max(moveEvent.clientX, 280), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Find saved messages conversation
  const savedConv = conversations.find((c) => c.isSaved);
  const otherConversations = conversations.filter((c) => !c.isSaved && c.name !== 'Избранное');

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

  // Should show Saved Messages row:
  // Strictly shown in 'Все' (all) tab, OR if the user is explicitly searching for 'избранное' or 'заметки'
  const isSearchMatchSaved =
    Boolean(search.trim()) &&
    ('избранное'.includes(search.toLowerCase()) ||
      'заметки'.includes(search.toLowerCase()) ||
      (savedConv?.lastMessage?.text || '').toLowerCase().includes(search.toLowerCase()));

  const showSavedInList =
    (filter === 'all' && !search.trim()) || isSearchMatchSaved;

  const isSavedActive = savedConv ? activeConversationId === savedConv.id : false;

  // Context Menu handler
  const handleContextMenu = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      targetConv: conv,
    });
  };

  const closeContextMenu = () => {
    setContextMenuState({ isOpen: false, position: null, targetConv: null });
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    const conv = contextMenuState.targetConv;
    if (!conv) return [];

    if (conv.isSaved) {
      return [
        {
          label: 'Очистить заметки',
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          danger: true,
          onClick: () => {
            clearConversation(conv.id);
            closeContextMenu();
          },
        },
      ];
    }

    return [
      {
        label: conv.isPinned ? 'Открепить' : 'Закрепить',
        icon: conv.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />,
        onClick: () => {
          togglePinChat(conv.id);
          closeContextMenu();
        },
      },
      {
        label: conv.isMuted ? 'Включить звук' : 'Без звука',
        icon: conv.isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />,
        onClick: () => {
          toggleMuteChat(conv.id);
          closeContextMenu();
        },
      },
      {
        label: 'Прочитано',
        icon: <CheckCheck className="w-4 h-4" />,
        onClick: () => {
          markConversationAsRead(conv.id);
          closeContextMenu();
        },
      },
      {
        label: 'Очистить историю',
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        separator: true,
        onClick: () => {
          clearConversation(conv.id);
          closeContextMenu();
        },
      },
    ];
  };

  // Toggle quick dark/light theme
  const handleToggleNightMode = () => {
    if (resolvedTheme === 'dark') {
      setThemePreset('light');
    } else {
      setThemePreset('telegram-dark');
    }
  };

  const densityPadding =
    settings.density === 'compact'
      ? 'p-2 gap-2.5'
      : settings.density === 'spacious'
      ? 'p-3.5 gap-3.5'
      : 'p-2.5 gap-3';

  return (
    <aside
      style={{ width: `${settings.sidebarWidth}px` }}
      className="relative h-full flex flex-col bg-[var(--bg-sidebar,#0e131f)] border-r border-[var(--border-subtle,rgba(255,255,255,0.08))] shrink-0 select-none transition-colors duration-150"
    >
      {/* Network connection banner */}
      {connectionStatus !== 'connected' && (
        <div className="bg-amber-500/15 border-b border-amber-500/25 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-center gap-2 shrink-0 animate-pulse">
          {connectionStatus === 'connecting' ? (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{connectionStatus === 'connecting' ? 'Подключение… (сервер просыпается)' : 'Переподключение к серверу…'}</span>
        </div>
      )}

      {/* Top Header Bar with Telegram Hamburger Menu & Search */}
      <div className="p-3 bg-[var(--bg-sidebar,#0e131f)]/90 backdrop-blur-md flex items-center gap-2 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] shrink-0">
        <button
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Главное меню"
          title="Меню"
          className="p-2 rounded-xl text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск чатов и сообщений..."
            className="w-full pl-9 pr-7 py-1.5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary,#94a3b8)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* New Chat Button */}
        <button
          onClick={onOpenNewChat}
          title="Новый диалог или группа"
          aria-label="Новый диалог или группа"
          className="p-2 rounded-xl text-[var(--accent-default,#6366f1)] hover:bg-[var(--accent-subtle,rgba(99,102,241,0.15))] active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Filter Tabs with Badges */}
      <div className="px-3 py-2 flex gap-1 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] shrink-0 bg-[var(--bg-sidebar,#0e131f)]">
        {(
          [
            { id: 'all', label: 'Все', unread: unreadAll },
            { id: 'direct', label: 'Личные', unread: unreadDirect },
            { id: 'group', label: 'Группы', unread: unreadGroup },
            { id: 'channel', label: 'Каналы', unread: unreadChannel },
          ] as const
        ).map((tab) => {
          const isSelected = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleFilterChange(tab.id)}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                  : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] hover:bg-white/5'
              }`}
            >
              <span>{tab.label}</span>
              {tab.unread > 0 && (
                <Badge
                  count={tab.unread}
                  variant={isSelected ? 'neutral' : 'accent'}
                  className={isSelected ? '!bg-white !text-[var(--accent-default,#6366f1)]' : ''}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {/* Single Saved Messages row (pinned top in 'all') */}
        {showSavedInList && (
          <div
            onClick={openSavedMessages}
            onContextMenu={(e) => savedConv && handleContextMenu(e, savedConv)}
            className={`rounded-2xl flex items-center cursor-pointer transition-all ${densityPadding} ${
              isSavedActive
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
                : 'hover:bg-white/5 text-[var(--text-secondary,#94a3b8)]'
            }`}
          >
            <Avatar name="Избранное" size="lg" isSaved={true} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-sm font-semibold truncate ${isSavedActive ? 'text-white' : 'text-[var(--text-primary,#f8fafc)]'}`}>
                    Избранное
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Pin className={`w-3 h-3 rotate-45 shrink-0 ${isSavedActive ? 'text-white' : 'text-[var(--accent-default,#6366f1)]'}`} />
                  {savedConv?.lastMessage && (
                    <span className={`text-[10px] ${isSavedActive ? 'text-white/80' : 'text-[var(--text-muted,#64748b)]'}`}>
                      {formatChatListTime(savedConv.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-xs truncate ${isSavedActive ? 'text-white/90' : 'text-[var(--text-secondary,#94a3b8)]'}`}>
                {savedConv?.lastMessage?.text || 'Ваши заметки и файлы'}
              </p>
            </div>
          </div>
        )}

        {/* Regular Chat Items */}
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isPartnerOnline = conv.type === 'direct' && conv.partner && onlineUserIds.has(conv.partner.id);

            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                onContextMenu={(e) => handleContextMenu(e, conv)}
                className={`rounded-2xl flex items-center cursor-pointer transition-all ${densityPadding} ${
                  isActive
                    ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
                    : 'hover:bg-white/5 text-[var(--text-secondary,#94a3b8)]'
                }`}
              >
                {/* Avatar with indicator */}
                <Avatar
                  src={conv.avatarUrl}
                  name={conv.name}
                  size="lg"
                  isOnline={Boolean(isPartnerOnline)}
                  isChannel={conv.isChannel}
                  isGroup={conv.type === 'group'}
                />

                {/* Info & Last message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isActive ? 'text-white' : 'text-[var(--text-primary,#f8fafc)]'
                        }`}
                      >
                        {conv.name}
                      </span>
                      {conv.isMuted && (
                        <VolumeX className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white/80' : 'text-slate-400'}`} />
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {conv.isPinned && (
                        <Pin className={`w-3 h-3 rotate-45 shrink-0 ${isActive ? 'text-white' : 'text-[var(--accent-default,#6366f1)]'}`} />
                      )}
                      {conv.lastMessage && (
                        <span
                          className={`text-[10px] ${
                            isActive ? 'text-white/80' : 'text-[var(--text-muted,#64748b)]'
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
                        isActive ? 'text-white/90' : 'text-[var(--text-secondary,#94a3b8)]'
                      }`}
                    >
                      {conv.lastMessage ? (
                        <>
                          {conv.type === 'group' && (
                            <span className={isActive ? 'font-medium text-white' : 'font-medium text-[var(--text-primary,#f8fafc)]'}>
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
                            <span className="flex items-center gap-1">
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
                      <Badge
                        count={conv.unreadCount}
                        isMuted={conv.isMuted}
                        variant={isActive ? 'neutral' : 'unread'}
                        className={isActive ? '!bg-white !text-[var(--accent-default,#6366f1)]' : ''}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        ) : !showSavedInList ? (
          <div className="py-12 text-center text-[var(--text-secondary,#94a3b8)] text-xs flex flex-col items-center">
            <MessageCircle className="w-8 h-8 opacity-40 mb-2" />
            <span>
              {search.trim()
                ? 'Чатов не найдено'
                : filter === 'direct'
                ? 'Личных диалогов пока нет'
                : filter === 'group'
                ? 'Групп пока нет'
                : filter === 'channel'
                ? 'Каналов пока нет'
                : 'Чатов пока нет'}
            </span>
            <button
              onClick={onOpenNewChat}
              className="mt-3 px-3 py-1.5 bg-[var(--accent-subtle,rgba(99,102,241,0.15))] hover:bg-[var(--accent-subtle,rgba(99,102,241,0.25))] text-[var(--accent-default,#6366f1)] text-xs font-medium rounded-xl transition-colors cursor-pointer"
            >
              {filter === 'group' ? 'Создать группу' : filter === 'channel' ? 'Создать канал' : 'Начать переписку'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Draggable border resizer on desktop */}
      <div
        onMouseDown={handleMouseDownResize}
        className="hidden md:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-default,#6366f1)]/50 active:bg-[var(--accent-default,#6366f1)] transition-colors z-30"
        title="Перетащите для изменения ширины"
      />

      {/* Telegram Drawer Menu */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          />

          {/* Drawer content */}
          <div className="relative w-72 max-w-[85vw] h-full bg-[var(--bg-sidebar,#0e131f)] shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-[var(--border-subtle,rgba(255,255,255,0.08))]">
            {/* User Profile Banner in Drawer */}
            <div className="p-5 bg-[var(--bg-app,#090d16)]/60 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))]">
              <Avatar
                src={currentUser?.avatarUrl}
                name={currentUser?.displayName || 'Пользователь'}
                size="xl"
                isOnline={true}
                className="mb-3"
              />
              <div className="text-sm font-bold text-[var(--text-primary,#f8fafc)] truncate">
                {currentUser?.displayName}
              </div>
              <div className="text-xs text-[var(--accent-default,#6366f1)] font-medium truncate">
                @{currentUser?.username}
              </div>
            </div>

            {/* Menu options */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onOpenProfile();
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary,#f8fafc)] hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
              >
                <User className="w-4 h-4 text-[var(--accent-default,#6366f1)]" />
                <span>Мой профиль</span>
              </button>

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  openSavedMessages();
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary,#f8fafc)] hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
              >
                <Bookmark className="w-4 h-4 text-amber-400" />
                <span>Избранное</span>
              </button>

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary,#f8fafc)] hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
              >
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>Настройки и оформление</span>
              </button>

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onOpenPhoneConnect();
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary,#f8fafc)] hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Подключить телефон (Android)</span>
              </button>

              {/* Night Mode Toggle */}
              <div
                onClick={handleToggleNightMode}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary,#f8fafc)] hover:bg-white/5 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3.5">
                  {resolvedTheme === 'dark' ? (
                    <Moon className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-400" />
                  )}
                  <span>Ночной режим</span>
                </div>
                <div
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${
                    resolvedTheme === 'dark' ? 'bg-[var(--accent-default,#6366f1)]' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                      resolvedTheme === 'dark' ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>

              <div className="my-2 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]" />

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  setIsLogoutModalOpen(true);
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 active:scale-98 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Выйти из аккаунта</span>
              </button>
            </div>

            {/* Version footer */}
            <div className="p-4 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] text-center">
              <span className="text-[11px] text-[var(--text-muted,#64748b)]">PulseChat Web v2.0 • Telegram UI</span>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu on chat item */}
      <ContextMenu
        isOpen={contextMenuState.isOpen}
        position={contextMenuState.position}
        items={getContextMenuItems()}
        onClose={closeContextMenu}
      />

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
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
