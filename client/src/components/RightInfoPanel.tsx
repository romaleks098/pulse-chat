import React, { useState, useMemo } from 'react';
import { useChat } from '../context/ChatContext';
import { Avatar } from './ui/Avatar';
import { Tabs } from './ui/Tabs';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { formatLastSeen, formatFileSize } from '../utils/format';
import {
  X,
  Image as ImageIcon,
  FileText,
  Mic,
  Link as LinkIcon,
  Bell,
  BellOff,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Users,
} from 'lucide-react';

interface RightInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onImageClick: (url: string, fileName?: string) => void;
}

type TabType = 'media' | 'files' | 'voice' | 'links' | 'members';

export const RightInfoPanel: React.FC<RightInfoPanelProps> = ({
  isOpen,
  onClose,
  onImageClick,
}) => {
  const {
    activeConversation,
    messages,
    onlineUserIds,
    toggleMuteChat,
    clearConversation,
  } = useChat();

  const [activeTab, setActiveTab] = useState<TabType>('media');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Extract shared items from current conversation's messages
  const mediaMessages = useMemo(() => {
    return messages.filter((m) => m.type === 'image' && m.fileUrl && !m.isDeleted);
  }, [messages]);

  const fileMessages = useMemo(() => {
    return messages.filter((m) => m.type === 'file' && m.fileUrl && !m.isDeleted);
  }, [messages]);

  const voiceMessages = useMemo(() => {
    return messages.filter((m) => m.type === 'voice' && m.fileUrl && !m.isDeleted);
  }, [messages]);

  const linkItems = useMemo(() => {
    const links: { url: string; date: string; sender: string }[] = [];
    const urlRegex = /(https?:\/\/[^\s]+|t\.me\/[^\s]+)/g;

    messages.forEach((m) => {
      if (!m.isDeleted && m.text) {
        const matches = m.text.match(urlRegex);
        if (matches) {
          matches.forEach((u) => {
            links.push({
              url: u.startsWith('t.me/') ? `https://${u}` : u,
              date: m.createdAt,
              sender: m.senderName,
            });
          });
        }
      }
    });

    return links;
  }, [messages]);

  if (!isOpen || !activeConversation) return null;

  const isSaved = Boolean(activeConversation.isSaved);
  const isDirect = activeConversation.type === 'direct' && !isSaved;
  const isGroup = activeConversation.type === 'group' && !activeConversation.isChannel;
  const isChannel = Boolean(activeConversation.isChannel);
  const partner = activeConversation.partner;
  const isPartnerOnline = partner && onlineUserIds.has(partner.id);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleClear = async () => {
    setShowClearConfirm(false);
    await clearConversation(activeConversation.id);
  };

  return (
    <aside className="w-80 lg:w-88 h-full bg-[var(--bg-sidebar,#0e131f)] border-l border-[var(--border-subtle,rgba(255,255,255,0.08))] flex flex-col shrink-0 overflow-hidden select-none animate-in slide-in-from-right-4 duration-200 z-20">
      {/* Panel Header */}
      <div className="h-14 px-4 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-between shrink-0 bg-[var(--bg-app,#090d16)]/50 backdrop-blur-md">
        <h3 className="text-sm font-semibold text-[var(--text-primary,#f8fafc)]">
          {isSaved ? 'Информация об Избранном' : isDirect ? 'Профиль собеседника' : isChannel ? 'Информация о канале' : 'Информация о группе'}
        </h3>
        <button
          onClick={onClose}
          aria-label="Закрыть панель"
          className="p-1.5 rounded-lg text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Card */}
        <div className="p-6 flex flex-col items-center text-center border-b border-[var(--border-subtle,rgba(255,255,255,0.08))]">
          <Avatar
            src={activeConversation.avatarUrl}
            name={activeConversation.name}
            size="2xl"
            isSaved={isSaved}
            isChannel={isChannel}
            isGroup={isGroup}
            isOnline={Boolean(isPartnerOnline)}
            className="mb-3 shadow-lg"
          />

          <h2 className="text-base font-bold text-[var(--text-primary,#f8fafc)] truncate max-w-full">
            {activeConversation.name}
          </h2>

          <div className="text-xs text-[var(--text-secondary,#94a3b8)] mt-0.5">
            {isSaved ? (
              <span>Ваше персональное облако сообщений</span>
            ) : isDirect ? (
              isPartnerOnline ? (
                <span className="text-emerald-400 font-medium">в сети</span>
              ) : (
                <span>{partner?.lastSeen ? formatLastSeen(partner.lastSeen) : 'был(а) недавно'}</span>
              )
            ) : isChannel ? (
              <span>{activeConversation.members?.length || 1} подписчиков</span>
            ) : (
              <span>{activeConversation.members?.length || 1} участников</span>
            )}
          </div>
        </div>

        {/* Details & Actions */}
        <div className="p-4 space-y-3 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))]">
          {/* Username */}
          {partner?.username && (
            <div
              onClick={() => handleCopy(`@${partner.username}`, 'username')}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-secondary,#94a3b8)]">
                  Имя пользователя
                </div>
                <div className="text-sm font-medium text-[var(--accent-default,#6366f1)]">
                  @{partner.username}
                </div>
              </div>
              <button className="text-[var(--text-secondary,#94a3b8)] hover:text-white p-1">
                {copiedField === 'username' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Status / Bio */}
          {(partner?.statusText || activeConversation.description) && (
            <div className="p-2.5 rounded-xl bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-0.5">
                О себе / Описание
              </div>
              <p className="text-xs text-[var(--text-primary,#f8fafc)] leading-relaxed select-text">
                {partner?.statusText || activeConversation.description}
              </p>
            </div>
          )}

          {/* Notifications toggle */}
          {!isSaved && (
            <div
              onClick={() => toggleMuteChat(activeConversation.id)}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {activeConversation.isMuted ? (
                  <BellOff className="w-4 h-4 text-slate-400" />
                ) : (
                  <Bell className="w-4 h-4 text-[var(--accent-default,#6366f1)]" />
                )}
                <div>
                  <div className="text-xs font-medium text-[var(--text-primary,#f8fafc)]">
                    Уведомления
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                    {activeConversation.isMuted ? 'Выключены' : 'Включены'}
                  </div>
                </div>
              </div>
              <div
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                  activeConversation.isMuted ? 'bg-slate-700' : 'bg-[var(--accent-default,#6366f1)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out ${
                    activeConversation.isMuted ? 'translate-x-0' : 'translate-x-5'
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Media / Files / Links Tabs */}
        <div className="p-3">
          <Tabs
            tabs={[
              { id: 'media', label: 'Медиа', icon: <ImageIcon className="w-3.5 h-3.5" />, count: mediaMessages.length },
              { id: 'files', label: 'Файлы', icon: <FileText className="w-3.5 h-3.5" />, count: fileMessages.length },
              { id: 'links', label: 'Ссылки', icon: <LinkIcon className="w-3.5 h-3.5" />, count: linkItems.length },
              { id: 'voice', label: 'Голос', icon: <Mic className="w-3.5 h-3.5" />, count: voiceMessages.length },
              ...((isGroup || isChannel)
                ? [{ id: 'members', label: 'Участники', icon: <Users className="w-3.5 h-3.5" />, count: activeConversation.members?.length || 1 }]
                : []),
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            variant="pills"
            className="mb-3"
          />

          {/* Tab content: Media Grid */}
          {activeTab === 'media' && (
            mediaMessages.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {mediaMessages.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onImageClick(m.fileUrl!, m.fileName)}
                    className="aspect-square rounded-lg overflow-hidden bg-slate-800 border border-white/5 cursor-pointer group relative"
                  >
                    <img
                      src={m.fileUrl}
                      alt={m.fileName || 'Медиа'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary,#94a3b8)] opacity-60">
                Нет общих медиафайлов
              </div>
            )
          )}

          {/* Tab content: Files */}
          {activeTab === 'files' && (
            fileMessages.length > 0 ? (
              <div className="space-y-1.5">
                {fileMessages.map((m) => (
                  <a
                    key={m.id}
                    href={m.fileUrl}
                    download={m.fileName || 'file'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[var(--text-primary,#f8fafc)] truncate">
                        {m.fileName || 'Файл'}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary,#94a3b8)]">
                        {m.fileSize ? formatFileSize(m.fileSize) : 'Документ'}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary,#94a3b8)] opacity-60">
                Нет общих файлов
              </div>
            )
          )}

          {/* Tab content: Voice */}
          {activeTab === 'voice' && (
            voiceMessages.length > 0 ? (
              <div className="space-y-2">
                {voiceMessages.map((m) => (
                  <div key={m.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-[10px] text-[var(--text-secondary,#94a3b8)] mb-1 flex justify-between">
                      <span>{m.senderName}</span>
                      <span>{formatLastSeen(m.createdAt)}</span>
                    </div>
                    <VoiceMessagePlayer audioUrl={m.fileUrl!} isOwn={false} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary,#94a3b8)] opacity-60">
                Нет голосовых сообщений
              </div>
            )
          )}

          {/* Tab content: Links */}
          {activeTab === 'links' && (
            linkItems.length > 0 ? (
              <div className="space-y-1.5">
                {linkItems.map((item, idx) => (
                  <a
                    key={idx}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-xs font-medium text-[var(--accent-default,#6366f1)] truncate">
                        {item.url}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary,#94a3b8)]">
                        {item.sender}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary,#94a3b8)] opacity-60">
                Нет ссылок в переписке
              </div>
            )
          )}

          {/* Tab content: Members */}
          {activeTab === 'members' && (isGroup || isChannel) && (
            <div className="space-y-2">
              {activeConversation.members && activeConversation.members.length > 0 ? (
                activeConversation.members.map((member) => {
                  const isOnline = onlineUserIds.has(member.id);
                  return (
                    <div key={member.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5">
                      <Avatar
                        src={member.avatarUrl}
                        name={member.displayName}
                        size="sm"
                        isOnline={isOnline}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--text-primary,#f8fafc)] truncate">
                          {member.displayName}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary,#94a3b8)] truncate">
                          {isOnline ? (
                            <span className="text-emerald-400">в сети</span>
                          ) : (
                            <span>{member.lastSeen ? formatLastSeen(member.lastSeen) : 'был(а) недавно'}</span>
                          )}
                        </div>
                      </div>
                      {member.role === 'admin' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                          Админ
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-[var(--text-secondary,#94a3b8)]">
                  Список участников недоступен
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danger actions at bottom */}
        <div className="p-4 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-2">
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isSaved ? 'Очистить заметки' : 'Очистить историю чата'}</span>
          </button>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-3xl p-6 shadow-2xl text-[var(--text-primary,#f8fafc)]">
            <h3 className="text-base font-bold text-[var(--text-primary,#f8fafc)] mb-2">
              {isSaved ? 'Очистить заметки?' : 'Очистить историю?'}
            </h3>
            <p className="text-xs text-[var(--text-secondary,#94a3b8)] mb-6 leading-relaxed">
              {isSaved
                ? 'Все ваши сохранённые заметки и файлы в этом чате будут удалены.'
                : 'Все сообщения в этом чате будут безвозвратно удалены. Вы уверены?'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-[var(--bg-surface-hover,rgba(255,255,255,0.08))] hover:bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] text-[var(--text-secondary,#cbd5e1)] text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-lg shadow-rose-600/30"
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
