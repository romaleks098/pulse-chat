import React, { useEffect, useState } from 'react';
import { isElectron } from '../config';
import { Minus, Square, Copy, X } from 'lucide-react';

export const DesktopTitlebar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (!api) return;

    api.isMaximized?.().then((max: boolean) => setIsMaximized(Boolean(max))).catch(() => {});
    api.onMaximizedChange?.((max: boolean) => setIsMaximized(Boolean(max)));
  }, []);

  if (!isElectron) {
    return null;
  }

  const api = (window as any).electronAPI;

  const handleMinimize = () => {
    api?.minimize?.();
  };

  const handleMaximize = () => {
    api?.maximize?.();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    api?.close?.();
  };

  return (
    <div
      className="h-8 w-full select-none bg-[var(--bg-surface,#141d33)] text-[var(--text-secondary,#94a3b8)] border-b border-[var(--border-subtle,rgba(255,255,255,0.06))] flex items-center justify-between px-3 z-50 shrink-0"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: App Logo & Title */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-md bg-gradient-to-tr from-[var(--accent-hover,#4f46e5)] to-[var(--accent-default,#6366f1)] flex items-center justify-center text-[10px] text-white font-black shadow-xs">
          ⚡
        </div>
        <span className="text-xs font-semibold tracking-wide text-[var(--text-primary,#f8fafc)]">
          PulseChat
        </span>
      </div>

      {/* Right: Window Controls */}
      <div
        className="flex items-center h-full -mr-3"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          type="button"
          onClick={handleMinimize}
          className="h-8 w-11 flex items-center justify-center hover:bg-white/10 active:bg-white/15 text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] transition-colors cursor-pointer"
          title="Свернуть"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className="h-8 w-11 flex items-center justify-center hover:bg-white/10 active:bg-white/15 text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] transition-colors cursor-pointer"
          title={isMaximized ? 'Восстановить' : 'Развернуть'}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="h-8 w-11 flex items-center justify-center hover:bg-rose-600 active:bg-rose-700 text-[var(--text-secondary,#94a3b8)] hover:text-white transition-colors cursor-pointer"
          title="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
