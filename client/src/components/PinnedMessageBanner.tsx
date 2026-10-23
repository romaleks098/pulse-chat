import React from 'react';
import { Pin, X, Mic, FileText, Image as ImageIcon } from 'lucide-react';
import type { Message } from '../types';

interface PinnedMessageBannerProps {
  pinnedMessage: Message | null;
  onJumpToMessage: (messageId: string) => void;
  onUnpin: () => void;
}

export const PinnedMessageBanner: React.FC<PinnedMessageBannerProps> = ({
  pinnedMessage,
  onJumpToMessage,
  onUnpin,
}) => {
  if (!pinnedMessage) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/95 border-b border-indigo-500/20 backdrop-blur-sm z-10 animate-in slide-in-from-top-2 duration-150">
      <div
        onClick={() => onJumpToMessage(pinnedMessage.id)}
        className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 group"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 group-hover:bg-indigo-500/20 transition-colors">
          <Pin className="w-4 h-4 fill-current rotate-45" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-indigo-400">Закрепленное сообщение</span>
            <span className="text-[11px] text-slate-500">· {pinnedMessage.senderName}</span>
          </div>
          <div className="text-xs text-slate-300 truncate flex items-center gap-1">
            {pinnedMessage.type === 'voice' && (
              <>
                <Mic className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Голосовое сообщение ({Math.round(pinnedMessage.voiceDuration || 0)} сек.)</span>
              </>
            )}
            {pinnedMessage.type === 'image' && (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Фотография {pinnedMessage.text ? `· ${pinnedMessage.text}` : ''}</span>
              </>
            )}
            {pinnedMessage.type === 'file' && (
              <>
                <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{pinnedMessage.fileName || 'Файл'}</span>
              </>
            )}
            {pinnedMessage.type === 'text' && <span>{pinnedMessage.text}</span>}
          </div>
        </div>
      </div>

      <button
        onClick={onUnpin}
        title="Открепить сообщение"
        className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
