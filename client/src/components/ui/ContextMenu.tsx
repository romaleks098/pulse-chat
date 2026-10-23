import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  separator?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  header?: React.ReactNode;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  position,
  items,
  header,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click, scroll or Esc key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  // Screen boundary detection
  const menuWidth = 200;
  const menuHeight = items.length * 38;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const left = position.x + menuWidth > screenWidth ? Math.max(10, screenWidth - menuWidth - 10) : position.x;
  const top = position.y + menuHeight > screenHeight ? Math.max(10, screenHeight - menuHeight - 10) : position.y;

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 min-w-[190px] bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.1))] rounded-2xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100 select-none backdrop-blur-xl"
    >
      {header && (
        <div className="px-2 py-1.5 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] mb-1">
          {header}
        </div>
      )}
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.separator && (
            <div className="my-1 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]" />
          )}
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full px-3 py-2 text-xs flex items-center gap-2.5 transition-colors cursor-pointer text-left ${
              item.danger
                ? 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
                : 'text-[var(--text-primary,#f8fafc)] hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.08))]'
            } ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {item.icon && <span className="w-4 h-4 shrink-0 opacity-80">{item.icon}</span>}
            <span className="truncate flex-1 font-medium">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
