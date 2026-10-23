import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type ThemePreset = 'classic-dark' | 'telegram-dark' | 'oled-black' | 'light' | 'emerald' | 'rose' | 'system';
export type ChatDensity = 'compact' | 'normal' | 'spacious';
export type AnimationMode = 'enabled' | 'reduced';

export interface ChatWallpaper {
  type: 'pattern' | 'solid' | 'gradient' | 'image';
  value: string;
  blur?: number;
  opacity?: number;
}

export interface ThemeSettings {
  preset: ThemePreset;
  customAccent: string | null;
  bubbleRadius: number; // 8 to 24 px
  fontSize: number; // 12 to 18 px
  density: ChatDensity;
  animations: AnimationMode;
  wallpaper: ChatWallpaper;
  sidebarWidth: number; // 280 to 460 px
  showRightPanel: boolean;
}

interface ThemeContextType {
  settings: ThemeSettings;
  resolvedTheme: 'dark' | 'light';
  setThemePreset: (preset: ThemePreset) => void;
  setCustomAccent: (color: string | null) => void;
  setBubbleRadius: (radius: number) => void;
  setFontSize: (size: number) => void;
  setDensity: (density: ChatDensity) => void;
  setAnimations: (mode: AnimationMode) => void;
  setWallpaper: (wallpaper: ChatWallpaper) => void;
  setSidebarWidth: (width: number) => void;
  setShowRightPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
  resetTheme: () => void;
  exportTheme: () => string;
  importTheme: (json: string) => boolean;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  preset: 'classic-dark',
  customAccent: null,
  bubbleRadius: 18,
  fontSize: 14,
  density: 'normal',
  animations: 'enabled',
  wallpaper: {
    type: 'pattern',
    value: 'stars',
    blur: 0,
    opacity: 0.15,
  },
  sidebarWidth: 340,
  showRightPanel: false,
};

const THEME_STORAGE_KEY = 'pulse_theme_v2';

const PRESET_DEFINITIONS: Record<Exclude<ThemePreset, 'system'>, Record<string, string>> = {
  'classic-dark': {
    '--bg-app': '#090d16',
    '--bg-sidebar': '#0e1424',
    '--bg-chat': '#070a12',
    '--bg-surface': '#141d33',
    '--bg-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--bg-surface-active': 'rgba(99, 102, 241, 0.16)',
    '--bg-input': '#0b101e',
    '--border-subtle': 'rgba(255, 255, 255, 0.08)',
    '--border-focus': 'rgba(99, 102, 241, 0.6)',
    '--text-primary': '#f8fafc',
    '--text-secondary': '#94a3b8',
    '--text-muted': '#64748b',
    '--accent-default': '#6366f1',
    '--accent-hover': '#4f46e5',
    '--accent-subtle': 'rgba(99, 102, 241, 0.15)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#141d33',
    '--bubble-in-text': '#f8fafc',
    '--bubble-in-time': '#94a3b8',
    '--bubble-out': '#6366f1',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.75)',
    '--badge-unread-bg': '#6366f1',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#475569',
    '--status-online': '#10b981',
    '--status-offline': '#64748b',
  },
  'telegram-dark': {
    '--bg-app': '#0e1621',
    '--bg-sidebar': '#17212b',
    '--bg-chat': '#0e1621',
    '--bg-surface': '#242f3d',
    '--bg-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--bg-surface-active': 'rgba(82, 136, 193, 0.18)',
    '--bg-input': '#242f3d',
    '--border-subtle': 'rgba(0, 0, 0, 0.25)',
    '--border-focus': '#5288c1',
    '--text-primary': '#f5f5f5',
    '--text-secondary': '#7f91a4',
    '--text-muted': '#647b91',
    '--accent-default': '#5288c1',
    '--accent-hover': '#4173a8',
    '--accent-subtle': 'rgba(82, 136, 193, 0.16)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#182533',
    '--bubble-in-text': '#ffffff',
    '--bubble-in-time': '#72899f',
    '--bubble-out': '#2b5278',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.7)',
    '--badge-unread-bg': '#5288c1',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#4e6274',
    '--status-online': '#4fae4e',
    '--status-offline': '#6b7f94',
  },
  'oled-black': {
    '--bg-app': '#000000',
    '--bg-sidebar': '#000000',
    '--bg-chat': '#000000',
    '--bg-surface': '#121212',
    '--bg-surface-hover': 'rgba(255, 255, 255, 0.08)',
    '--bg-surface-active': 'rgba(99, 102, 241, 0.22)',
    '--bg-input': '#141414',
    '--border-subtle': '#222222',
    '--border-focus': '#6366f1',
    '--text-primary': '#ffffff',
    '--text-secondary': '#a1a1aa',
    '--text-muted': '#71717a',
    '--accent-default': '#6366f1',
    '--accent-hover': '#4f46e5',
    '--accent-subtle': 'rgba(99, 102, 241, 0.2)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#18181b',
    '--bubble-in-text': '#ffffff',
    '--bubble-in-time': '#a1a1aa',
    '--bubble-out': '#4f46e5',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.75)',
    '--badge-unread-bg': '#6366f1',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#3f3f46',
    '--status-online': '#10b981',
    '--status-offline': '#52525b',
  },
  'light': {
    '--bg-app': '#ffffff',
    '--bg-sidebar': '#ffffff',
    '--bg-chat': '#f0f2f5',
    '--bg-surface': '#ffffff',
    '--bg-surface-hover': 'rgba(0, 0, 0, 0.04)',
    '--bg-surface-active': 'rgba(59, 130, 246, 0.12)',
    '--bg-input': '#f4f4f5',
    '--border-subtle': '#e4e4e7',
    '--border-focus': '#3b82f6',
    '--text-primary': '#09090b',
    '--text-secondary': '#52525b',
    '--text-muted': '#71717a',
    '--accent-default': '#3b82f6',
    '--accent-hover': '#2563eb',
    '--accent-subtle': 'rgba(59, 130, 246, 0.12)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#ffffff',
    '--bubble-in-text': '#09090b',
    '--bubble-in-time': '#71717a',
    '--bubble-out': '#e0e7ff',
    '--bubble-out-text': '#1e1b4b',
    '--bubble-out-time': '#4338ca',
    '--badge-unread-bg': '#3b82f6',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#a1a1aa',
    '--status-online': '#10b981',
    '--status-offline': '#9ca3af',
  },
  'emerald': {
    '--bg-app': '#06120d',
    '--bg-sidebar': '#091c14',
    '--bg-chat': '#050f0b',
    '--bg-surface': '#0e291e',
    '--bg-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--bg-surface-active': 'rgba(16, 185, 129, 0.18)',
    '--bg-input': '#081710',
    '--border-subtle': 'rgba(16, 185, 129, 0.12)',
    '--border-focus': '#10b981',
    '--text-primary': '#ecfdf5',
    '--text-secondary': '#a7f3d0',
    '--text-muted': '#34d399',
    '--accent-default': '#10b981',
    '--accent-hover': '#059669',
    '--accent-subtle': 'rgba(16, 185, 129, 0.15)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#0e291e',
    '--bubble-in-text': '#ecfdf5',
    '--bubble-in-time': '#6ee7b7',
    '--bubble-out': '#059669',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.75)',
    '--badge-unread-bg': '#10b981',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#064e3b',
    '--status-online': '#34d399',
    '--status-offline': '#047857',
  },
  'rose': {
    '--bg-app': '#140912',
    '--bg-sidebar': '#1c0d1a',
    '--bg-chat': '#0f060e',
    '--bg-surface': '#291426',
    '--bg-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--bg-surface-active': 'rgba(244, 63, 94, 0.18)',
    '--bg-input': '#170b15',
    '--border-subtle': 'rgba(244, 63, 94, 0.12)',
    '--border-focus': '#f43f5e',
    '--text-primary': '#fff1f2',
    '--text-secondary': '#fda4af',
    '--text-muted': '#fb7185',
    '--accent-default': '#f43f5e',
    '--accent-hover': '#e11d48',
    '--accent-subtle': 'rgba(244, 63, 94, 0.15)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#291426',
    '--bubble-in-text': '#fff1f2',
    '--bubble-in-time': '#f43f5e',
    '--bubble-out': '#e11d48',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.75)',
    '--badge-unread-bg': '#f43f5e',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#881337',
    '--status-online': '#fb7185',
    '--status-offline': '#4c0519',
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  });

  // Watch system color scheme changes
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'dark' | 'light' = useMemo(() => {
    if (settings.preset === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return settings.preset === 'light' ? 'light' : 'dark';
  }, [settings.preset, systemIsDark]);

  // Save settings to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Apply CSS Variables to :root
  useEffect(() => {
    const root = document.documentElement;
    const effectivePreset: Exclude<ThemePreset, 'system'> =
      settings.preset === 'system'
        ? systemIsDark
          ? 'classic-dark'
          : 'light'
        : settings.preset;

    const presetTokens = PRESET_DEFINITIONS[effectivePreset] || PRESET_DEFINITIONS['classic-dark'];

    // Apply base preset tokens
    Object.entries(presetTokens).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });

    // Apply custom accent if set
    if (settings.customAccent) {
      root.style.setProperty('--accent-default', settings.customAccent);
      root.style.setProperty('--accent-hover', settings.customAccent);
      root.style.setProperty('--accent-subtle', `${settings.customAccent}26`); // 15% alpha
      root.style.setProperty('--bubble-out', settings.customAccent);
      root.style.setProperty('--badge-unread-bg', settings.customAccent);
    }

    // Apply typography & geometry
    root.style.setProperty('--font-size-base', `${settings.fontSize}px`);
    root.style.setProperty('--bubble-radius', `${settings.bubbleRadius}px`);
    root.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`);

    // Chat density spacing
    const densitySpacing = settings.density === 'compact' ? '6px' : settings.density === 'spacious' ? '14px' : '10px';
    root.style.setProperty('--chat-item-py', densitySpacing);

    // Dark/light dataset attribute for child CSS selectors
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-preset', effectivePreset);
    root.setAttribute('data-animations', settings.animations);
  }, [settings, systemIsDark, resolvedTheme]);

  const setThemePreset = useCallback((preset: ThemePreset) => {
    setSettings((s) => ({ ...s, preset }));
  }, []);

  const setCustomAccent = useCallback((color: string | null) => {
    setSettings((s) => ({ ...s, customAccent: color }));
  }, []);

  const setBubbleRadius = useCallback((radius: number) => {
    setSettings((s) => ({ ...s, bubbleRadius: Math.max(8, Math.min(28, radius)) }));
  }, []);

  const setFontSize = useCallback((size: number) => {
    setSettings((s) => ({ ...s, fontSize: Math.max(12, Math.min(18, size)) }));
  }, []);

  const setDensity = useCallback((density: ChatDensity) => {
    setSettings((s) => ({ ...s, density }));
  }, []);

  const setAnimations = useCallback((mode: AnimationMode) => {
    setSettings((s) => ({ ...s, animations: mode }));
  }, []);

  const setWallpaper = useCallback((wallpaper: ChatWallpaper) => {
    setSettings((s) => ({ ...s, wallpaper }));
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    setSettings((s) => ({ ...s, sidebarWidth: Math.max(260, Math.min(460, width)) }));
  }, []);

  const setShowRightPanel = useCallback((show: boolean | ((prev: boolean) => boolean)) => {
    setSettings((s) => ({
      ...s,
      showRightPanel: typeof show === 'function' ? show(s.showRightPanel) : show,
    }));
  }, []);

  const resetTheme = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const exportTheme = useCallback(() => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  const importTheme = useCallback((jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        setSettings((prev) => ({ ...prev, ...parsed }));
        return true;
      }
    } catch {}
    return false;
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        resolvedTheme,
        setThemePreset,
        setCustomAccent,
        setBubbleRadius,
        setFontSize,
        setDensity,
        setAnimations,
        setWallpaper,
        setSidebarWidth,
        setShowRightPanel,
        resetTheme,
        exportTheme,
        importTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
