import React from 'react';

interface BadgeProps {
  count?: number;
  isMuted?: boolean;
  variant?: 'unread' | 'accent' | 'neutral' | 'dot';
  className?: string;
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  count,
  isMuted = false,
  variant = 'unread',
  className = '',
  children,
}) => {
  if (variant === 'dot') {
    return (
      <span
        className={`w-2 h-2 rounded-full ${
          isMuted ? 'bg-slate-500' : 'bg-indigo-500'
        } ${className}`}
      />
    );
  }

  const content = children || (count !== undefined && count > 0 ? (count > 999 ? '999+' : count) : null);
  if (!content) return null;

  const bgStyles = isMuted
    ? 'bg-slate-600/80 text-slate-200'
    : variant === 'accent'
    ? 'bg-indigo-600 text-white shadow-sm'
    : variant === 'neutral'
    ? 'bg-slate-800 text-slate-300'
    : 'bg-[var(--badge-unread-bg,#6366f1)] text-[var(--badge-unread-text,#ffffff)] shadow-sm';

  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0.5 min-w-[18px] h-[18px] text-[11px] font-bold rounded-full select-none leading-none tracking-tight ${bgStyles} ${className}`}
    >
      {content}
    </span>
  );
};
