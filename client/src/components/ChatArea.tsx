import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { useCall } from '../context/CallContext';
import { useTheme } from '../context/ThemeContext';
import type { Message, ReplyInfo } from '../types';
import { formatMessageTime, formatFileSize, formatLastSeen, formatDateSeparator } from '../utils/format';
import { api } from '../services/api';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { VoiceRecorder } from './VoiceRecorder';
import { PinnedMessageBanner } from './PinnedMessageBanner';
import { RightInfoPanel } from './RightInfoPanel';
import { FormattedMessageText } from './FormattedMessageText';
import { Avatar } from './ui/Avatar';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Smile,
  Reply,
  Trash2,
  Edit2,
  Download,
  X,
  FileText,
  Users,
  CheckCheck,
  Phone,
  Video,
  Pin,
  Search,
  ChevronUp,
  ChevronDown,
  Bookmark,
  MessageCircle,
  PanelRight,
  Copy,
} from 'lucide-react';

const POPULAR_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '👏', '🎉'];

interface ChatAreaProps {
  onBack: () => void;
  onOpenPhoneConnect?: () => void;
  onImageClick: (url: string, fileName?: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onBack,
  onImageClick,
}) => {
  const {
    currentUser,
    activeConversation,
    messages,
    loadingMessages,
    sendMessage,
    pinMessage,
    startTyping,
    stopTyping,
    typingUsers,
    onlineUserIds,
    toggleReaction,
    editMessage,
    deleteMessage,
  } = useChat();

  const { startCall } = useCall();
  const { settings } = useTheme();

  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [activeReactionMenuMsgId, setActiveReactionMenuMsgId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Message Context Menu state
  const [msgContextMenu, setMsgContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    message: Message | null;
  }>({
    isOpen: false,
    position: null,
    message: null,
  });

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !activeConversation) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchMessages(activeConversation.id, searchQuery).then((res) => {
        setSearchResults(res);
        setCurrentMatchIdx(0);
        if (res.length > 0) {
          jumpToMessage(res[0].id);
        }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showSearch, activeConversation?.id]);

  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[var(--accent-default,#6366f1)]');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[var(--accent-default,#6366f1)]');
      }, 2000);
    }
  };

  // Auto scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeConversation?.id]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length]);

  if (!activeConversation) {
    return (
      <div className="flex-1 h-full bg-[var(--bg-chat,#090d16)] flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary,#94a3b8)]">
        <div className="w-16 h-16 rounded-3xl bg-[var(--bg-surface,#141c2e)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-center mb-4 text-[var(--accent-default,#6366f1)] shadow-xl">
          <MessageCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[var(--text-primary,#f8fafc)] mb-1">Выберите диалог</h3>
        <p className="text-xs max-w-sm text-[var(--text-secondary,#94a3b8)]">
          Выберите существующий чат слева или начните новый разговор с друзьями и коллегами
        </p>
      </div>
    );
  }

  const isSaved = Boolean(activeConversation.isSaved);
  const isDirect = activeConversation.type === 'direct' && !isSaved;
  const isGroup = activeConversation.type === 'group' && !activeConversation.isChannel;
  const isChannel = Boolean(activeConversation.isChannel);
  const isPartnerOnline =
    isDirect &&
    activeConversation.partner &&
    onlineUserIds.has(activeConversation.partner.id);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (e.target.value.trim()) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    if (editingMessage) {
      editMessage(editingMessage.id, trimmed);
      setEditingMessage(null);
      setInputText('');
      return;
    }

    sendMessage({
      text: trimmed,
      type: 'text',
      replyToId: replyTo?.id,
    });

    setInputText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
  };

  // Keyboard navigation & shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Up arrow to edit last sent message
    if (e.key === 'ArrowUp' && !inputText.trim() && !editingMessage) {
      e.preventDefault();
      const lastOwnMessage = [...messages].reverse().find((m) => m.senderId === currentUser?.id && !m.isDeleted && m.type === 'text');
      if (lastOwnMessage) {
        startEdit(lastOwnMessage);
      }
      return;
    }

    // Escape to cancel edit/reply
    if (e.key === 'Escape') {
      if (editingMessage) cancelEdit();
      if (replyTo) setReplyTo(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadResult = await api.uploadFile(file);
      sendMessage({
        text: file.name,
        type: uploadResult.type,
        fileUrl: uploadResult.url,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        replyToId: replyTo?.id,
      });
      setReplyTo(null);
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startEdit = (msg: Message) => {
    setEditingMessage(msg);
    setInputText(msg.text);
    setReplyTo(null);
    textareaRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
  };

  // Message Context Menu Handler
  const handleMsgContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setMsgContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      message: msg,
    });
  };

  const closeMsgContextMenu = () => {
    setMsgContextMenu({ isOpen: false, position: null, message: null });
  };

  const getMsgContextMenuItems = (): ContextMenuItem[] => {
    const msg = msgContextMenu.message;
    if (!msg || msg.isDeleted) return [];

    const isOwn = msg.senderId === currentUser?.id;

    const items: ContextMenuItem[] = [
      {
        label: 'Ответить',
        icon: <Reply className="w-4 h-4" />,
        onClick: () => {
          setReplyTo({
            id: msg.id,
            senderName: msg.senderName,
            text: msg.text,
            type: msg.type,
            fileName: msg.fileName,
          });
          closeMsgContextMenu();
          textareaRef.current?.focus();
        },
      },
      {
        label: 'Скопировать текст',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => {
          if (msg.text) navigator.clipboard.writeText(msg.text);
          closeMsgContextMenu();
        },
      },
      {
        label: activeConversation.pinnedMessageId === msg.id ? 'Открепить' : 'Закрепить',
        icon: <Pin className="w-4 h-4 rotate-45" />,
        onClick: () => {
          pinMessage(activeConversation.pinnedMessageId === msg.id ? null : msg.id);
          closeMsgContextMenu();
        },
      },
    ];

    if (isOwn && msg.type === 'text') {
      items.push({
        label: 'Редактировать',
        icon: <Edit2 className="w-4 h-4" />,
        onClick: () => {
          startEdit(msg);
          closeMsgContextMenu();
        },
      });
    }

    if (isOwn) {
      items.push({
        label: 'Удалить',
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        separator: true,
        onClick: () => {
          deleteMessage(msg.id);
          closeMsgContextMenu();
        },
      });
    }

    return items;
  };

  // Determine wallpaper style/class
  const wallpaperClass =
    settings.wallpaper.type === 'pattern' && settings.wallpaper.value !== 'none'
      ? settings.wallpaper.value
      : '';

  const wallpaperInlineStyle: React.CSSProperties = {};
  if (settings.wallpaper.type === 'solid') {
    wallpaperInlineStyle.backgroundColor = settings.wallpaper.value;
  } else if (settings.wallpaper.type === 'gradient') {
    wallpaperInlineStyle.background = settings.wallpaper.value;
  }

  return (
    <div className="flex-1 h-full flex overflow-hidden relative">
      <main className="flex-1 h-full flex flex-col bg-[var(--bg-chat,#090d16)] overflow-hidden relative">
        {/* Top Chat Header */}
        <header className="h-14 px-3.5 bg-[var(--bg-chat,#090d16)]/90 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-between gap-3 shrink-0 backdrop-blur-md z-10">
          <div
            onClick={() => setShowInfoPanel((prev) => !prev)}
            className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-90 transition-opacity flex-1"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBack();
              }}
              aria-label="Назад к списку чатов"
              className="md:hidden p-1.5 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <Avatar
              src={activeConversation.avatarUrl}
              name={activeConversation.name}
              size="md"
              isSaved={isSaved}
              isChannel={isChannel}
              isGroup={isGroup}
              isOnline={!isSaved && Boolean(isPartnerOnline)}
            />

            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary,#f8fafc)] truncate leading-tight">
                {activeConversation.name}
              </h2>
              <div className="text-[11px] truncate flex items-center gap-1.5">
                {isSaved ? (
                  <span className="text-[var(--text-secondary,#94a3b8)]">Ваши заметки и файлы</span>
                ) : isDirect ? (
                  typingUsers.length > 0 ? (
                    <span className="text-[var(--accent-default,#6366f1)] font-medium">печатает…</span>
                  ) : (
                    <span className={isPartnerOnline ? 'text-emerald-400 font-medium' : 'text-[var(--text-secondary,#94a3b8)]'}>
                      {formatLastSeen(activeConversation.partner?.lastSeen, Boolean(isPartnerOnline))}
                    </span>
                  )
                ) : (
                  <span className="text-[var(--text-secondary,#94a3b8)] flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {activeConversation.members?.length || 1} {isChannel ? 'подписчиков' : 'участников'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowSearch((prev) => !prev)}
              title="Поиск сообщений в чате"
              aria-label="Поиск сообщений в чате"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                showSearch ? 'bg-[var(--accent-default,#6366f1)] text-white' : 'text-[var(--text-secondary,#94a3b8)] hover:text-white hover:bg-white/10'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {!isSaved && isDirect && (
              <>
                <button
                  onClick={() => startCall(activeConversation.id, false)}
                  title="Аудиозвонок"
                  aria-label="Аудиозвонок"
                  className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                </button>

                <button
                  onClick={() => startCall(activeConversation.id, true)}
                  title="Видеозвонок"
                  aria-label="Видеозвонок"
                  className="p-2 text-[var(--accent-default,#6366f1)] hover:bg-[var(--accent-subtle,rgba(99,102,241,0.15))] rounded-xl transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={() => setShowInfoPanel((prev) => !prev)}
              title="Информация о чате"
              aria-label="Информация о чате"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                showInfoPanel
                  ? 'bg-[var(--accent-default,#6366f1)] text-white'
                  : 'text-[var(--text-secondary,#94a3b8)] hover:text-white hover:bg-white/10'
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Inline Message Search Bar */}
        {showSearch && (
          <div className="p-2.5 bg-[var(--bg-chat,#090d16)] border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center gap-2 z-20">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по переписке..."
                className="w-full pl-9 pr-3 py-1.5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-white placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)]"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-[var(--text-secondary,#94a3b8)] shrink-0">
                <span>{currentMatchIdx + 1} из {searchResults.length}</span>
                <button
                  onClick={() => {
                    const nextIdx = (currentMatchIdx - 1 + searchResults.length) % searchResults.length;
                    setCurrentMatchIdx(nextIdx);
                    jumpToMessage(searchResults[nextIdx].id);
                  }}
                  className="p-1 hover:text-white rounded hover:bg-white/10 cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const nextIdx = (currentMatchIdx + 1) % searchResults.length;
                    setCurrentMatchIdx(nextIdx);
                    jumpToMessage(searchResults[nextIdx].id);
                  }}
                  className="p-1 hover:text-white rounded hover:bg-white/10 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pinned Message Banner */}
        <PinnedMessageBanner
          pinnedMessage={activeConversation.pinnedMessage || null}
          onJumpToMessage={jumpToMessage}
          onUnpin={() => pinMessage(null)}
        />

        {/* Messages Feed with Wallpaper */}
        <div
          style={wallpaperInlineStyle}
          className={`flex-1 overflow-y-auto p-4 space-y-3 ${wallpaperClass}`}
        >
          {loadingMessages ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-[var(--accent-default,#6366f1)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary,#94a3b8)]">
              <div className="w-16 h-16 rounded-3xl bg-[var(--bg-surface,#141c2e)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-center mb-3 text-[var(--accent-default,#6366f1)] shadow-xl">
                {isSaved ? <Bookmark className="w-8 h-8 fill-current" /> : <MessageCircle className="w-8 h-8" />}
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary,#f8fafc)] mb-1">
                {isSaved ? 'Ваши заметки и файлы' : 'Сообщений пока нет'}
              </p>
              <p className="text-xs text-[var(--text-muted,#64748b)] max-w-xs leading-relaxed">
                {isSaved
                  ? 'Сохраняйте здесь важные мысли, голосовые заметки и файлы. Они синхронизированы на всех устройствах.'
                  : 'Отправьте первое сообщение, чтобы начать диалог!'}
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.senderId === currentUser?.id;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const currentDateLabel = formatDateSeparator(msg.createdAt);
              const prevDateLabel = prevMsg ? formatDateSeparator(prevMsg.createdAt) : null;
              const showDateHeader = !prevMsg || currentDateLabel !== prevDateLabel;

              return (
                <React.Fragment key={msg.id}>
                  {/* Telegram Date Pill */}
                  {showDateHeader && (
                    <div className="flex justify-center my-3 sticky top-1 z-10 select-none">
                      <span className="px-3 py-0.5 bg-black/40 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-semibold rounded-full shadow-sm">
                        {currentDateLabel}
                      </span>
                    </div>
                  )}

                  <div
                    id={`msg-${msg.id}`}
                    onContextMenu={(e) => handleMsgContextMenu(e, msg)}
                    className={`flex gap-2 group relative transition-all duration-200 ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isMe && (
                      <Avatar
                        src={msg.senderAvatar}
                        name={msg.senderName}
                        size="sm"
                        className="self-end mb-0.5 shrink-0"
                      />
                    )}

                    {/* Message Bubble */}
                    <div
                      style={{
                        borderRadius: `${settings.bubbleRadius}px`,
                      }}
                      className={`relative max-w-[85%] sm:max-w-md md:max-w-lg p-2.5 shadow-sm transition-all select-text ${
                        isMe
                          ? 'bg-[var(--accent-default,#6366f1)] text-white rounded-br-xs'
                          : 'bg-[var(--bg-bubble-incoming,#151c2c)] border border-[var(--border-subtle,rgba(255,255,255,0.06))] text-[var(--text-primary,#f8fafc)] rounded-bl-xs'
                      }`}
                    >
                      {/* Sender Name in group */}
                      {!isMe && isGroup && (
                        <div className="text-[11px] font-semibold text-[var(--accent-default,#818cf8)] mb-1">
                          {msg.senderName}
                        </div>
                      )}

                      {/* Quoted / Reply Preview */}
                      {msg.replyTo && (
                        <div
                          onClick={() => msg.replyTo && jumpToMessage(msg.replyTo.id)}
                          className={`mb-2 p-2 rounded-xl border-l-2 text-xs cursor-pointer hover:opacity-90 transition-opacity ${
                            isMe
                              ? 'bg-black/20 border-white text-indigo-100'
                              : 'bg-black/20 border-[var(--accent-default,#6366f1)] text-[var(--text-secondary,#94a3b8)]'
                          }`}
                        >
                          <div className="font-semibold text-[11px] text-[var(--accent-default,#a5b4fc)]">
                            {msg.replyTo.senderName}
                          </div>
                          <div className="truncate text-[11px] opacity-80">
                            {msg.replyTo.text}
                          </div>
                        </div>
                      )}

                      {/* Image Attachment */}
                      {msg.type === 'image' && msg.fileUrl && (
                        <div className="mb-1.5 overflow-hidden rounded-xl bg-black/20">
                          <img
                            src={msg.fileUrl}
                            alt={msg.fileName || 'Photo'}
                            onClick={() => onImageClick(msg.fileUrl!, msg.fileName)}
                            className="max-h-80 w-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                          />
                        </div>
                      )}

                      {/* File Attachment */}
                      {msg.type === 'file' && msg.fileUrl && (
                        <div
                          className={`mb-1.5 p-2 rounded-xl flex items-center justify-between gap-3 ${
                            isMe ? 'bg-black/20' : 'bg-black/20 border border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{msg.fileName}</div>
                              <div className="text-[10px] opacity-70">
                                {formatFileSize(msg.fileSize)}
                              </div>
                            </div>
                          </div>
                          <a
                            href={msg.fileUrl}
                            download={msg.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      )}

                      {/* Voice Message Content */}
                      {msg.type === 'voice' && msg.fileUrl && (
                        <div className="mb-1">
                          <VoiceMessagePlayer audioUrl={msg.fileUrl} duration={msg.voiceDuration} isOwn={isMe} />
                        </div>
                      )}

                      {/* Text Content with Markdown Formatting */}
                      {msg.isDeleted ? (
                        <p className="italic opacity-60 text-xs">Сообщение удалено</p>
                      ) : (
                        msg.type === 'text' && (
                          <div className="text-[13px] leading-relaxed select-text">
                            <FormattedMessageText text={msg.text} isOutgoing={isMe} />
                          </div>
                        )
                      )}

                      {/* Timestamp & Read Status inside bubble */}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
                          isMe ? 'text-white/80' : 'text-[var(--text-muted,#64748b)]'
                        }`}
                      >
                        {msg.updatedAt !== msg.createdAt && <span className="opacity-75">изм.</span>}
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMe && (
                          <CheckCheck className="w-3.5 h-3.5 text-white/90" />
                        )}
                      </div>

                      {/* Reactions List */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-1 border-t border-white/10">
                          {Object.entries(
                            msg.reactions.reduce((acc, r) => {
                              acc[r.emoji] = acc[r.emoji] || [];
                              acc[r.emoji].push(r);
                              return acc;
                            }, {} as Record<string, typeof msg.reactions>)
                          ).map(([emoji, reacts]) => {
                            const hasMyReact = reacts.some((r) => r.userId === currentUser?.id);
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-all cursor-pointer ${
                                  hasMyReact
                                    ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/40'
                                    : 'bg-black/25 hover:bg-black/40 text-white/90'
                                }`}
                                title={reacts.map((r) => r.userName).join(', ')}
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] font-semibold">{reacts.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Quick action hover bar */}
                      {!msg.isDeleted && (
                        <div
                          className={`absolute top-1 hidden group-hover:flex items-center gap-0.5 p-1 bg-[var(--bg-sidebar,#0e131f)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl shadow-xl z-10 ${
                            isMe ? '-left-32' : '-right-32'
                          }`}
                        >
                          <button
                            onClick={() =>
                              setReplyTo({
                                id: msg.id,
                                senderName: msg.senderName,
                                text: msg.text,
                                type: msg.type,
                                fileName: msg.fileName,
                              })
                            }
                            title="Ответить"
                            className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded hover:bg-white/10 cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => pinMessage(activeConversation.pinnedMessageId === msg.id ? null : msg.id)}
                            title={activeConversation.pinnedMessageId === msg.id ? 'Открепить' : 'Закрепить'}
                            className={`p-1 rounded hover:bg-white/10 cursor-pointer ${
                              activeConversation.pinnedMessageId === msg.id
                                ? 'text-[var(--accent-default,#6366f1)] bg-[var(--accent-subtle,rgba(99,102,241,0.15))]'
                                : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5 rotate-45" />
                          </button>

                          <button
                            onClick={() =>
                              setActiveReactionMenuMsgId(
                                activeReactionMenuMsgId === msg.id ? null : msg.id
                              )
                            }
                            title="Реакция"
                            className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded hover:bg-white/10 cursor-pointer"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>

                          {isMe && msg.type === 'text' && (
                            <button
                              onClick={() => startEdit(msg)}
                              title="Редактировать"
                              className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded hover:bg-white/10 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isMe && (
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              title="Удалить"
                              className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-rose-400 rounded hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Quick Emoji Popover */}
                      {activeReactionMenuMsgId === msg.id && (
                        <div
                          className={`absolute -top-10 flex items-center gap-1.5 p-1.5 bg-[var(--bg-sidebar,#0e131f)] border border-[var(--border-subtle,rgba(255,255,255,0.12))] rounded-full shadow-2xl z-20 animate-in zoom-in-90 ${
                            isMe ? 'right-0' : 'left-0'
                          }`}
                        >
                          {POPULAR_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                toggleReaction(msg.id, emoji);
                                setActiveReactionMenuMsgId(null);
                              }}
                              className="w-7 h-7 flex items-center justify-center hover:scale-125 transition-transform text-sm cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--accent-default,#6366f1)] bg-[var(--bg-chat,#090d16)]/80 border border-white/10 px-3 py-1.5 rounded-full w-max animate-pulse">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[var(--accent-default,#6366f1)] rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-[var(--accent-default,#6366f1)] rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent-default,#6366f1)] rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
              <span>
                {typingUsers.join(', ')} {typingUsers.length > 1 ? 'печатают...' : 'печатает...'}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input / Composer Area */}
        <footer className="p-3 bg-[var(--bg-chat,#090d16)]/95 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] shrink-0 backdrop-blur-md">
          {/* Reply Banner */}
          {replyTo && (
            <div className="mb-2 p-2 bg-[var(--bg-surface,#141c2e)] border border-[var(--accent-default,#6366f1)]/30 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Reply className="w-4 h-4 text-[var(--accent-default,#6366f1)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--accent-default,#a5b4fc)]">{replyTo.senderName}</div>
                  <div className="text-[11px] text-[var(--text-secondary,#94a3b8)] truncate">{replyTo.text}</div>
                </div>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Edit Banner */}
          {editingMessage && (
            <div className="mb-2 p-2 bg-[var(--bg-surface,#141c2e)] border border-amber-500/30 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Edit2 className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="text-xs font-semibold text-amber-300">Редактирование сообщения</div>
              </div>
              <button
                onClick={cancelEdit}
                className="p-1 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Emoji Drawer */}
          {showEmojiPicker && (
            <div className="mb-2 p-2.5 bg-[var(--bg-sidebar,#0e131f)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-2xl flex flex-wrap gap-2 shadow-2xl">
              {[...POPULAR_EMOJIS, '😎', '🚀', '⭐', '🤝', '💯', '✨', '⚡', '🤖', '🔥', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setInputText((prev) => prev + emoji);
                    textareaRef.current?.focus();
                  }}
                  className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg hover:scale-110 transition-transform cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Attachment Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt,.zip"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Прикрепить файл или фото"
              className="p-2.5 text-[var(--text-secondary,#94a3b8)] hover:text-white hover:bg-white/10 rounded-xl transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-[var(--accent-default,#6366f1)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>

            {/* Emoji Button */}
            <button
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title="Эмодзи"
              className={`p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                showEmojiPicker
                  ? 'bg-[var(--accent-default,#6366f1)] text-white'
                  : 'text-[var(--text-secondary,#94a3b8)] hover:text-white hover:bg-white/10'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Auto-growing Textarea */}
            <div className="flex-1 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-2xl focus-within:border-[var(--accent-default,#6366f1)] transition-colors p-1 flex items-center">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Напишите сообщение... (↑ для ред.)"
                className="w-full bg-transparent px-3 py-1.5 text-sm text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Dynamic Send / Mic Button */}
            {inputText.trim() ? (
              <button
                onClick={handleSend}
                className="p-2.5 bg-[var(--accent-default,#6366f1)] hover:opacity-90 text-white rounded-xl shadow-lg transition-all shrink-0 cursor-pointer active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <VoiceRecorder
                disabled={uploading}
                onSendVoice={(fileUrl, duration) => {
                  sendMessage({
                    text: '',
                    type: 'voice',
                    fileUrl,
                    voiceDuration: duration,
                    replyToId: replyTo?.id,
                  });
                  setReplyTo(null);
                }}
              />
            )}
          </div>
        </footer>

        {/* Message Context Menu */}
        <ContextMenu
          isOpen={msgContextMenu.isOpen}
          position={msgContextMenu.position}
          items={getMsgContextMenuItems()}
          onClose={closeMsgContextMenu}
        />
      </main>

      {/* Slide-in Right Info Panel */}
      <RightInfoPanel
        isOpen={showInfoPanel}
        onClose={() => setShowInfoPanel(false)}
        onImageClick={onImageClick}
      />
    </div>
  );
};
