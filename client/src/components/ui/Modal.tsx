import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'md',
  showCloseButton = true,
}) => {
  // Close on Esc key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-3xl p-6 shadow-2xl relative text-[var(--text-primary,#f8fafc)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        {/* Header if title or icon provided */}
        {(title || icon) && (
          <div className="flex items-center justify-between gap-3 mb-5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="w-11 h-11 rounded-2xl bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent-default,#6366f1)] flex items-center justify-center shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && <h2 className="text-lg font-bold text-white truncate">{title}</h2>}
                {subtitle && <p className="text-xs text-[var(--text-secondary,#94a3b8)] truncate">{subtitle}</p>}
              </div>
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="p-2 text-[var(--text-secondary,#94a3b8)] hover:text-white rounded-full hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.08))] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Modal content body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
};
