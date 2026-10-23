import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 select-none cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs sm:text-sm px-4 py-2 gap-2',
    lg: 'text-sm px-5 py-2.5 gap-2.5',
    icon: 'p-2 rounded-xl',
  }[size];

  const variantStyles = {
    primary:
      'bg-[var(--accent-default,#6366f1)] hover:bg-[var(--accent-hover,#4f46e5)] text-white shadow-md shadow-indigo-500/20',
    accent:
      'bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-[var(--accent-default,#6366f1)] hover:bg-[var(--accent-default,#6366f1)] hover:text-white',
    secondary:
      'bg-[var(--bg-surface,#141d33)] hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.08))] text-[var(--text-primary,#f8fafc)] border border-[var(--border-subtle,rgba(255,255,255,0.08))]',
    ghost:
      'bg-transparent hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.06))] text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};
