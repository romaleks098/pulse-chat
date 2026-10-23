import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type ThemePreset = 'classic-dark' | 'telegram-dark' | 'oled-black' | 'light' | 'emerald' | 'rose' | 'system';
export type ChatDensity = 'compact' | 'normal' | 'spacious';
export type AnimationMode = 'enabled' | 'reduced';
export type FontFamily = 'system' | 'inter' | 'mono';

export interface ChatWallpaper {
  type: 'pattern' | 'solid' | 'gradient' | 'image';
  value: string;
  pattern?: 'none' | 'stars' | 'geometry' | 'subtle';
  blur?: number; // 0 to 20 px
  dimming?: number; // 0 to 80 %
  opacity?: number; // pattern opacity 0 to 1
}

export interface ThemeSettings {
  preset: ThemePreset;
  customAccent: string | null;
  customBubbleOut: string | null;
  bubbleRadius: number; // 4 to 20 px
  fontSize: number; // 13 to 20 px
  density: ChatDensity;
  fontFamily: FontFamily;
  animations: AnimationMode;
  glassmorphism: boolean;
  wallpaper: ChatWallpaper;
  sidebarWidth: number; // 260 to 500 px
  showRightPanel: boolean;
}

interface ThemeContextType {
  settings: ThemeSettings;
  resolvedTheme: 'dark' | 'light';
  setThemePreset: (preset: ThemePreset) => void;
  setCustomAccent: (color: string | null) => void;
  setCustomBubbleOut: (color: string | null) => void;
  setBubbleRadius: (radius: number) => void;
  setFontSize: (size: number) => void;
  setDensity: (density: ChatDensity) => void;
  setFontFamily: (family: FontFamily) => void;
  setAnimations: (mode: AnimationMode) => void;
  setGlassmorphism: (enabled: boolean) => void;
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
  customBubbleOut: null,
  bubbleRadius: 16,
  fontSize: 14,
  density: 'normal',
  fontFamily: 'system',
  animations: 'enabled',
  glassmorphism: true,
  wallpaper: {
    type: 'gradient',
    value: 'linear-gradient(135deg, #090d16 0%, #131b2e 50%, #1f1d36 100%)',
    pattern: 'stars',
    blur: 0,
    dimming: 0,
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
    '--text-secondary': '#cbd5e1',
    '--text-muted': '#94a3b8',
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
    '--status-offline': '#94a3b8',
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
    '--text-secondary': '#a9bed3',
    '--text-muted': '#8ba2b8',
    '--accent-default': '#5288c1',
    '--accent-hover': '#4173a8',
    '--accent-subtle': 'rgba(82, 136, 193, 0.16)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#182533',
    '--bubble-in-text': '#ffffff',
    '--bubble-in-time': '#8ba2b8',
    '--bubble-out': '#2b5278',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.7)',
    '--badge-unread-bg': '#5288c1',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#4e6274',
    '--status-online': '#4fae4e',
    '--status-offline': '#8ba2b8',
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
    '--text-secondary': '#cbd5e1',
    '--text-muted': '#94a3b8',
    '--accent-default': '#6366f1',
    '--accent-hover': '#4f46e5',
    '--accent-subtle': 'rgba(99, 102, 241, 0.2)',
    '--accent-text': '#ffffff',
    '--bubble-in': '#18181b',
    '--bubble-in-text': '#ffffff',
    '--bubble-in-time': '#94a3b8',
    '--bubble-out': '#4f46e5',
    '--bubble-out-text': '#ffffff',
    '--bubble-out-time': 'rgba(255, 255, 255, 0.75)',
    '--badge-unread-bg': '#6366f1',
    '--badge-unread-text': '#ffffff',
    '--badge-muted-bg': '#3f3f46',
    '--status-online': '#10b981',
    '--status-offline': '#71717a',
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
      root.style.setProperty('--badge-unread-bg', settings.customAccent);
    }

    // Apply custom outgoing bubble if set
    if (settings.customBubbleOut) {
      root.style.setProperty('--bubble-out', settings.customBubbleOut);
    } else if (settings.customAccent) {
      root.style.setProperty('--bubble-out', settings.customAccent);
    }

    // Apply typography & geometry
    root.style.setProperty('--font-size-base', `${settings.fontSize}px`);
    root.style.setProperty('--msg-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--bubble-radius', `${settings.bubbleRadius}px`);
    root.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`);

    // Font family selection
    const fontFamilyStr =
      settings.fontFamily === 'inter'
        ? `'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
        : settings.fontFamily === 'mono'
        ? `'JetBrains Mono', 'Fira Code', 'Courier New', monospace`
        : `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    root.style.setProperty('--font-family', fontFamilyStr);
    root.style.fontFamily = fontFamilyStr;

    // Glassmorphism blur
    root.style.setProperty('--glass-blur', settings.glassmorphism ? '16px' : '0px');

    // Ensure incoming bubble compatibility alias
    if (presetTokens['--bubble-in']) {
      root.style.setProperty('--bg-bubble-incoming', presetTokens['--bubble-in']);
    }

    // Shadows based on theme
    if (resolvedTheme === 'dark') {
      root.style.setProperty('--shadow-sm', '0 1px 2px 0 rgba(0, 0, 0, 0.4)');
      root.style.setProperty('--shadow-md', '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5)');
      root.style.setProperty('--shadow-lg', '0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -4px rgba(0, 0, 0, 0.6)');
      root.style.setProperty('--bubble-in-shadow', '0 1px 2px rgba(0, 0, 0, 0.25)');
      root.style.setProperty('--bubble-out-shadow', '0 1px 2px rgba(0, 0, 0, 0.3)');
    } else {
      root.style.setProperty('--shadow-sm', '0 1px 2px 0 rgba(0, 0, 0, 0.05)');
      root.style.setProperty('--shadow-md', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--shadow-lg', '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--bubble-in-shadow', '0 1px 2px rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--bubble-out-shadow', '0 1px 2px rgba(0, 0, 0, 0.12)');
    }

    // Chat density spacing
    const densitySpacing = settings.density === 'compact' ? '6px' : settings.density === 'spacious' ? '14px' : '10px';
    const densityHeight = settings.density === 'compact' ? '54px' : settings.density === 'spacious' ? '72px' : '64px';
    root.style.setProperty('--chat-item-py', densitySpacing);
    root.style.setProperty('--list-item-height', densityHeight);

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

  const setCustomBubbleOut = useCallback((color: string | null) => {
    setSettings((s) => ({ ...s, customBubbleOut: color }));
  }, []);

  const setBubbleRadius = useCallback((radius: number) => {
    setSettings((s) => ({ ...s, bubbleRadius: Math.max(4, Math.min(20, radius)) }));
  }, []);

  const setFontSize = useCallback((size: number) => {
    setSettings((s) => ({ ...s, fontSize: Math.max(13, Math.min(20, size)) }));
  }, []);

  const setDensity = useCallback((density: ChatDensity) => {
    setSettings((s) => ({ ...s, density }));
  }, []);

  const setFontFamily = useCallback((fontFamily: FontFamily) => {
    setSettings((s) => ({ ...s, fontFamily }));
  }, []);

  const setAnimations = useCallback((mode: AnimationMode) => {
    setSettings((s) => ({ ...s, animations: mode }));
  }, []);

  const setGlassmorphism = useCallback((glassmorphism: boolean) => {
    setSettings((s) => ({ ...s, glassmorphism }));
  }, []);

  const setWallpaper = useCallback((wallpaper: ChatWallpaper) => {
    setSettings((s) => ({ ...s, wallpaper }));
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    setSettings((s) => ({ ...s, sidebarWidth: Math.max(260, Math.min(500, width)) }));
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
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          bubbleRadius: Math.max(4, Math.min(20, Number(parsed.bubbleRadius ?? prev.bubbleRadius))),
          fontSize: Math.max(13, Math.min(20, Number(parsed.fontSize ?? prev.fontSize))),
          sidebarWidth: Math.max(260, Math.min(500, Number(parsed.sidebarWidth ?? prev.sidebarWidth))),
        }));
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
        setCustomBubbleOut,
        setBubbleRadius,
        setFontSize,
        setDensity,
        setFontFamily,
        setAnimations,
        setGlassmorphism,
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
