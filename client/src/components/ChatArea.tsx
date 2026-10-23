import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { useCall } from '../context/CallContext';
import type { Message, ReplyInfo } from '../types';
import { formatMessageTime, formatFileSize } from '../utils/format';
import { api } from '../services/api';
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
  Smartphone,
  Check,
  Phone,
  Video,
} from 'lucide-react';

const POPULAR_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '👏', '🎉'];

interface ChatAreaProps {
  onBack: () => void;
  onOpenPhoneConnect: () => void;
  onImageClick: (url: string, fileName?: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onBack,
  onOpenPhoneConnect,
  onImageClick,
}) => {
  const {
    currentUser,
    activeConversation,
    messages,
    loadingMessages,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    onlineUserIds,
    toggleReaction,
    editMessage,
    deleteMessage,
  } = useChat();

  const { startCall } = useCall();

  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMenuMsgId, setActiveReactionMenuMsgId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-indigo-400">
          <Smartphone className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-300 mb-1">Выберите диалог</h3>
        <p className="text-xs max-w-sm text-slate-500">
          Выберите существующий чат слева или начните новый разговор с друзьями и коллегами
        </p>
      </div>
    );
  }

  const isPartnerOnline =
    activeConversation.type === 'direct' &&
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  return (
    <main className="flex-1 h-full flex flex-col bg-slate-950 overflow-hidden relative">
      {/* Top Chat Header */}
      <header className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative shrink-0">
            <img
              src={activeConversation.avatarUrl}
              alt={activeConversation.name}
              className="w-10 h-10 rounded-full bg-slate-800 object-cover border border-slate-700"
            />
            {activeConversation.type === 'direct' && (
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                  isPartnerOnline ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate leading-tight">
              {activeConversation.name}
            </h2>
            <div className="text-[11px] truncate flex items-center gap-1.5">
              {activeConversation.type === 'direct' ? (
                isPartnerOnline ? (
                  <span className="text-emerald-400 font-medium">В сети</span>
                ) : (
                  <span className="text-slate-400">Был(а) недавно</span>
                )
              ) : (
                <span className="text-slate-400 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {activeConversation.members.length} участников
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right action button */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => startCall(activeConversation.id, false)}
            title="Аудиозвонок"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            onClick={() => startCall(activeConversation.id, true)}
            title="Видеозвонок"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <Video className="w-4 h-4 text-indigo-400" />
          </button>

          <button
            onClick={onOpenPhoneConnect}
            title="Открыть на телефоне"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-medium rounded-xl transition-colors ml-1"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Телефон</span>
          </button>
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs">
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 mb-2">
              👋 Начните общение первым!
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 group relative ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && (
                  <img
                    src={msg.senderAvatar}
                    alt={msg.senderName}
                    className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 shrink-0 self-end mb-1"
                  />
                )}

                <div
                  className={`relative max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl p-3 shadow-md transition-all ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-900 border border-slate-800/80 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {/* Sender Name in group */}
                  {!isMe && activeConversation.type === 'group' && (
                    <div className="text-[11px] font-semibold text-indigo-400 mb-1">
                      {msg.senderName}
                    </div>
                  )}

                  {/* Quoted / Reply Preview */}
                  {msg.replyTo && (
                    <div
                      className={`mb-2 p-2 rounded-xl border-l-2 text-xs ${
                        isMe
                          ? 'bg-indigo-700/60 border-white text-indigo-100'
                          : 'bg-slate-950/60 border-indigo-500 text-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-[11px] text-indigo-300">
                        {msg.replyTo.senderName}
                      </div>
                      <div className="truncate text-[11px] opacity-80">
                        {msg.replyTo.text}
                      </div>
                    </div>
                  )}

                  {/* Image Attachment */}
                  {msg.type === 'image' && msg.fileUrl && (
                    <div className="mb-2 overflow-hidden rounded-xl bg-slate-950/40">
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
                      className={`mb-2 p-2.5 rounded-xl flex items-center justify-between gap-3 ${
                        isMe ? 'bg-indigo-700/60' : 'bg-slate-950/60 border border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-7 h-7 text-indigo-400 shrink-0" />
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
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Text Content */}
                  {msg.isDeleted ? (
                    <p className="italic opacity-60 text-xs">Сообщение удалено</p>
                  ) : (
                    msg.type === 'text' && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.text}
                      </p>
                    )
                  )}

                  {/* Timestamp & Info */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMe ? 'text-indigo-200' : 'text-slate-500'
                    }`}
                  >
                    {msg.updatedAt !== msg.createdAt && <span>ред.</span>}
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {isMe && <Check className="w-3 h-3 text-indigo-200" />}
                  </div>

                  {/* Reactions List */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-1 border-t border-white/10">
                      {/* Group reactions by emoji */}
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
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-all ${
                              hasMyReact
                                ? 'bg-indigo-500 text-white shadow-sm ring-1 ring-white/30'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
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

                  {/* Quick Action Menu Button */}
                  {!msg.isDeleted && (
                    <div
                      className={`absolute top-1 hidden group-hover:flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl shadow-lg z-10 ${
                        isMe ? '-left-28' : '-right-28'
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
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>

                      {/* Quick reaction popover toggle */}
                      <button
                        onClick={() =>
                          setActiveReactionMenuMsgId(
                            activeReactionMenuMsgId === msg.id ? null : msg.id
                          )
                        }
                        title="Реакция"
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>

                      {isMe && msg.type === 'text' && (
                        <button
                          onClick={() => startEdit(msg)}
                          title="Редактировать"
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isMe && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          title="Удалить"
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Reaction selector popover */}
                  {activeReactionMenuMsgId === msg.id && (
                    <div
                      className={`absolute -top-10 flex items-center gap-1.5 p-1.5 bg-slate-900 border border-slate-700 rounded-full shadow-2xl z-20 animate-in zoom-in-90 ${
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
                          className="w-7 h-7 flex items-center justify-center hover:scale-125 transition-transform text-sm"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator bubble */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full w-max animate-pulse">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <span>
              {typingUsers.join(', ')} {typingUsers.length > 1 ? 'печатают...' : 'печатает...'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / Composer Area */}
      <footer className="p-3 bg-slate-900/90 border-t border-slate-800 shrink-0 backdrop-blur-md">
        {/* Reply Bar */}
        {replyTo && (
          <div className="mb-2 p-2 bg-slate-950/70 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Reply className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-indigo-300">{replyTo.senderName}</div>
                <div className="text-[11px] text-slate-400 truncate">{replyTo.text}</div>
              </div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Edit Bar */}
        {editingMessage && (
          <div className="mb-2 p-2 bg-slate-950/70 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Edit2 className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-xs font-semibold text-amber-300">Редактирование сообщения</div>
            </div>
            <button
              onClick={cancelEdit}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Emoji picker drawer */}
        {showEmojiPicker && (
          <div className="mb-2 p-2.5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-wrap gap-2 shadow-2xl">
            {[...POPULAR_EMOJIS, '😎', '🚀', '⭐', '🤝', '💯', '✨', '⚡', '🤖'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  textareaRef.current?.focus();
                }}
                className="w-9 h-9 rounded-xl hover:bg-slate-800 flex items-center justify-center text-lg hover:scale-110 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File Upload Button */}
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
            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors shrink-0 disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>

          {/* Emoji Toggle */}
          <button
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Эмодзи"
            className={`p-2.5 rounded-xl transition-colors shrink-0 ${
              showEmojiPicker
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Textarea */}
          <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl focus-within:border-indigo-500 transition-colors p-1 flex items-center">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Напишите сообщение..."
              className="w-full bg-transparent px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none resize-none max-h-32 leading-relaxed"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-30 disabled:hover:bg-indigo-600 shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </main>
  );
};
