import React, { useState, useMemo } from 'react';
import { useChat } from '../context/ChatContext';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Avatar } from './ui/Avatar';
import type { Message, Conversation } from '../types';
import {
  Forward,
  Search,
  Bookmark,
  Users,
  Radio,
  FileText,
  Image as ImageIcon,
  Mic,
} from 'lucide-react';

interface ForwardModalProps {
  isOpen: boolean;
  message: Message | null;
  onClose: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  message,
  onClose,
}) => {
  const { conversations, forwardMessage } = useChat();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const query = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.partner && c.partner.username.toLowerCase().includes(query))
    );
  }, [conversations, search]);

  if (!isOpen || !message) return null;

  const handleSelectConv = async (conv: Conversation) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await forwardMessage(message, conv.id);
      toast.success(`Сообщение переслано в «${conv.name}»`);
      onClose();
    } catch (err) {
      toast.error('Не удалось переслать сообщение');
    } finally {
      setSubmitting(false);
    }
  };

  const getMessageSnippet = () => {
    if (message.type === 'image') return '📷 Фотография';
    if (message.type === 'file') return `📎 Файл: ${message.fileName || ''}`;
    if (message.type === 'voice') return '🎤 Голосовое сообщение';
    return message.text;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Переслать сообщение"
      subtitle="Выберите чат для отправки"
      icon={<Forward className="w-5 h-5 text-[var(--accent-default,#6366f1)]" />}
      maxWidth="sm"
    >
      <div className="space-y-4">
        {/* Message preview snippet */}
        <div className="p-3 rounded-2xl bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent-default,#6366f1)] flex items-center justify-center shrink-0">
            {message.type === 'image' && <ImageIcon className="w-4 h-4" />}
            {message.type === 'file' && <FileText className="w-4 h-4" />}
            {message.type === 'voice' && <Mic className="w-4 h-4" />}
            {message.type === 'text' && <Forward className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-[var(--accent-default,#6366f1)] truncate">
              {message.senderName}
            </div>
            <div className="text-xs text-[var(--text-secondary,#94a3b8)] line-clamp-2">
              {getMessageSnippet()}
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск чата..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
          />
        </div>

        {/* Chat List */}
        <div className="max-h-72 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted,#64748b)]">
              Чаты не найдены
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSaved = conv.isSaved || conv.name === 'Избранное';
              return (
                <button
                  key={conv.id}
                  disabled={submitting}
                  onClick={() => handleSelectConv(conv)}
                  className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.05))] active:scale-98 transition-all cursor-pointer text-left border border-transparent hover:border-[var(--border-subtle,rgba(255,255,255,0.08))]"
                >
                  {isSaved ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Bookmark className="w-5 h-5 fill-current" />
                    </div>
                  ) : conv.isChannel ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Radio className="w-5 h-5" />
                    </div>
                  ) : conv.type === 'group' ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Users className="w-5 h-5" />
                    </div>
                  ) : (
                    <Avatar
                      src={conv.partner?.avatarUrl}
                      name={conv.name}
                      size="md"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--text-primary,#f8fafc)] truncate">
                      {conv.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary,#94a3b8)] truncate">
                      {isSaved
                        ? 'Личные заметки и облако'
                        : conv.isChannel
                        ? 'Канал'
                        : conv.type === 'group'
                        ? 'Групповой чат'
                        : `@${conv.partner?.username || 'пользователь'}`}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
