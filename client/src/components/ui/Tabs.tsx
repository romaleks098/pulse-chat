import React, { useRef, useEffect } from 'react';
import { Badge } from './Badge';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  badge?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pills' | 'compact';
  className?: string;
  tabClassName?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
  tabClassName = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active tab into view in horizontally scrolling containers
  useEffect(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector<HTMLElement>('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar select-none ${
        variant === 'underline'
          ? 'border-b border-[var(--border-subtle,rgba(255,255,255,0.08))] px-2'
          : variant === 'pills'
          ? 'bg-[var(--bg-surface-hover,rgba(255,255,255,0.05))] p-1 rounded-2xl'
          : 'p-0.5'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        if (variant === 'underline') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              data-active={isActive}
              onClick={() => onChange(tab.id)}
              className={`relative px-3.5 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'text-[var(--accent-default,#6366f1)] font-bold'
                  : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
              } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${tabClassName}`}
            >
              {tab.icon && <span className="w-3.5 h-3.5 shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined ? (
                tab.badge
              ) : tab.count !== undefined && tab.count > 0 ? (
                <Badge count={tab.count} variant={isActive ? 'accent' : 'neutral'} />
              ) : null}

              {/* Active animated bottom bar indicator */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--accent-default,#6366f1)] shadow-sm animate-in fade-in zoom-in-95 duration-150" />
              )}
            </button>
          );
        }

        // 'pills' or 'compact'
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            data-active={isActive}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
              isActive
                ? 'bg-[var(--accent-default,#6366f1)] text-[var(--accent-text,#ffffff)] shadow-sm scale-[1.02]'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)] hover:bg-[var(--bg-surface-hover,rgba(255,255,255,0.06))]'
            } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${tabClassName}`}
          >
            {tab.icon && <span className="w-3.5 h-3.5 shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined ? (
              tab.badge
            ) : tab.count !== undefined && tab.count > 0 ? (
              <Badge count={tab.count} variant={isActive ? 'neutral' : 'accent'} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
