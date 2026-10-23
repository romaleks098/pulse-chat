import React, { useState, useRef } from 'react';
import { useTheme, type ThemePreset, type ChatDensity, type FontFamily } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Slider } from './ui/Slider';
import { ColorPicker } from './ui/ColorPicker';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { Spoiler } from './FormattedMessageText';
import {
  Palette,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  Smartphone,
  Check,
  CheckCheck,
  Laptop,
  Globe,
  Trash2,
  LogOut,
  QrCode,
  Image as ImageIcon,
  CloudUpload,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPhoneConnect?: () => void;
}

const PRESET_OPTIONS: { id: ThemePreset; name: string; previewBg: string; previewAccent: string; isDark: boolean }[] = [
  { id: 'classic-dark', name: 'Pulse Dark (Deep Blue)', previewBg: '#090d16', previewAccent: '#6366f1', isDark: true },
  { id: 'telegram-dark', name: 'Telegram Night', previewBg: '#0e1621', previewAccent: '#5288c1', isDark: true },
  { id: 'oled-black', name: 'OLED Чёрная', previewBg: '#000000', previewAccent: '#6366f1', isDark: true },
  { id: 'light', name: 'Светлая (Day)', previewBg: '#ffffff', previewAccent: '#3b82f6', isDark: false },
  { id: 'emerald', name: 'Изумрудная (Emerald)', previewBg: '#06120d', previewAccent: '#10b981', isDark: true },
  { id: 'rose', name: 'Розовая (Rose)', previewBg: '#140912', previewAccent: '#f43f5e', isDark: true },
  { id: 'system', name: 'Авто (как в системе)', previewBg: '#1e293b', previewAccent: '#6366f1', isDark: true },
];

const ACCENT_PRESETS = [
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Telegram Blue', color: '#5288c1' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Purple', color: '#a855f7' },
];

const BUBBLE_COLOR_PRESETS = [
  { name: 'По умолчанию', value: null },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Telegram Blue', value: '#2b5278' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Crimson', value: '#e11d48' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Sunset Gradient', value: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)' },
  { name: 'Cyber Gradient', value: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' },
  { name: 'Ocean Gradient', value: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' },
];

const WALLPAPER_PRESETS: { id: string; name: string; type: 'solid' | 'gradient'; value: string }[] = [
  { id: 'cosmic', name: 'Космос', type: 'gradient', value: 'linear-gradient(135deg, #090d16 0%, #131b2e 50%, #1f1d36 100%)' },
  { id: 'tg-night', name: 'Telegram Night', type: 'gradient', value: 'linear-gradient(135deg, #0e1621 0%, #17212b 50%, #1e2c3a 100%)' },
  { id: 'deep-cyan', name: 'Глубокий циан', type: 'gradient', value: 'linear-gradient(135deg, #041f29 0%, #083344 50%, #0e4e66 100%)' },
  { id: 'sunset', name: 'Закат', type: 'gradient', value: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #451a03 100%)' },
  { id: 'emerald', name: 'Изумрудный бор', type: 'gradient', value: 'linear-gradient(135deg, #051b14 0%, #0a3324 50%, #064e3b 100%)' },
  { id: 'dark-pure', name: 'Глубокий чёрный', type: 'solid', value: '#070a12' },
  { id: 'day-sky', name: 'Утреннее небо', type: 'gradient', value: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)' },
  { id: 'soft-gray', name: 'Чистый серый', type: 'solid', value: '#f1f5f9' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenPhoneConnect,
}) => {
  const {
    settings,
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
    resetTheme,
    exportTheme,
    importTheme,
  } = useTheme();

  const {
    currentUser,
    updateProfile,
    sessions,
    loadSessions,
    revokeSession,
    revokeAllOtherSessions,
  } = useChat();

  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'appearance' | 'devices' | 'account'>('appearance');
  const [importJson, setImportJson] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [syncingWithServer, setSyncingWithServer] = useState(false);
  const [revokingOther, setRevokingOther] = useState(false);

  React.useEffect(() => {
    if (isOpen && activeTab === 'devices') {
      loadSessions();
    }
  }, [isOpen, activeTab, loadSessions]);

  const handleExport = () => {
    const json = exportTheme();
    navigator.clipboard.writeText(json);
    toast.success('Тема скопирована в буфер обмена в формате JSON');
  };

  const handleDownloadTheme = () => {
    const json = exportTheme();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsechat-theme-${settings.preset}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Файл темы скачан');
  };

  const handleImportSubmit = () => {
    if (!importJson.trim()) return;
    const ok = importTheme(importJson.trim());
    if (ok) {
      toast.success('Тема успешно применена!');
      setShowImportBox(false);
      setImportJson('');
    } else {
      toast.error('Неверный формат JSON темы');
    }
  };

  const handleSaveToCloud = async () => {
    setSyncingWithServer(true);
    try {
      await updateProfile({
        themeSettings: settings,
      });
      toast.success('Настройки темы синхронизированы с вашим профилем!');
    } catch {
      toast.error('Не удалось синхронизировать тему с сервером');
    } finally {
      setSyncingWithServer(false);
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите файл изображения');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setWallpaper({
          ...settings.wallpaper,
          type: 'image',
          value: reader.result,
        });
        toast.success('Фоновое изображение загружено!');
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Настройки"
      subtitle="Оформление и параметры интерфейса"
      icon={<Palette className="w-6 h-6 text-[var(--accent-default,#6366f1)]" />}
      maxWidth="lg"
    >
      {/* Top Tabs */}
      <div className="flex p-1 bg-[var(--bg-input,#080c14)] rounded-2xl mb-6 border border-[var(--border-subtle,rgba(255,255,255,0.08))] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
              : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Оформление</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('devices')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'devices'
              ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
              : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Устройства ({sessions.length || 1})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'account'
              ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
              : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Аккаунт</span>
        </button>
      </div>

      {activeTab === 'appearance' ? (
        <div className="space-y-6 pb-2">
          {/* ======================================================== */}
          {/* 1. INTERACTIVE LIVE PREVIEW BOX                          */}
          {/* ======================================================== */}
          <div className="rounded-3xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] relative overflow-hidden shadow-2xl">
            {/* Live Preview Wallpaper Layer */}
            {settings.wallpaper.type === 'image' ? (
              <div
                className="absolute inset-0 bg-cover bg-center transition-all"
                style={{
                  backgroundImage: `url(${settings.wallpaper.value})`,
                  filter: settings.wallpaper.blur ? `blur(${settings.wallpaper.blur}px)` : undefined,
                  transform: settings.wallpaper.blur ? 'scale(1.08)' : undefined,
                }}
              />
            ) : (
              <div
                className="absolute inset-0 transition-all"
                style={{
                  background: settings.wallpaper.value || 'var(--bg-chat)',
                }}
              />
            )}

            {/* Dimming overlay */}
            {Boolean(settings.wallpaper.dimming) && (
              <div
                className="absolute inset-0 bg-black pointer-events-none transition-opacity"
                style={{ opacity: (settings.wallpaper.dimming || 0) / 100 }}
              />
            )}

            {/* Pattern overlay */}
            {settings.wallpaper.pattern && settings.wallpaper.pattern !== 'none' && (
              <div
                className={`absolute inset-0 pointer-events-none chat-pattern-${settings.wallpaper.pattern}`}
                style={{ opacity: settings.wallpaper.opacity ?? 0.15 }}
              />
            )}

            {/* Live Preview Content */}
            <div className="relative z-10 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted,#94a3b8)] bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-xs">
                  Живой предпросмотр чата
                </span>
                <span className="text-[10px] text-emerald-400 font-mono bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Preview
                </span>
              </div>

              <div
                className="space-y-3"
                style={{
                  fontSize: `${settings.fontSize}px`,
                  fontFamily:
                    settings.fontFamily === 'inter'
                      ? `'Inter', system-ui, sans-serif`
                      : settings.fontFamily === 'mono'
                      ? `'JetBrains Mono', monospace`
                      : `system-ui, sans-serif`,
                }}
              >
                {/* Demo Message 1: Incoming */}
                <div className="flex items-end gap-2 max-w-[85%]">
                  <Avatar name="Павел Дуров" size="sm" className="mb-0.5 shadow-sm" />
                  <div
                    style={{
                      borderRadius: `${settings.bubbleRadius}px`,
                      borderBottomLeftRadius: '4px',
                      backgroundColor: 'var(--bubble-in, #141d33)',
                      color: 'var(--bubble-in-text, #f8fafc)',
                    }}
                    className="p-3 shadow-md border border-white/5 relative"
                  >
                    <div className="text-[11px] font-bold text-[var(--accent-default,#6366f1)] mb-0.5">
                      Павел Дуров
                    </div>
                    <p className="leading-relaxed">
                      Привет! Как тебе новый стиль PulseChat в духе Telegram? 🚀
                    </p>
                    <span className="text-[10px] opacity-70 block text-right mt-1">
                      12:45
                    </span>
                  </div>
                </div>

                {/* Demo Message 2: Outgoing with custom bubble */}
                <div className="flex items-end justify-end gap-2">
                  <div
                    style={{
                      borderRadius: `${settings.bubbleRadius}px`,
                      borderBottomRightRadius: '4px',
                      background: settings.customBubbleOut || 'var(--bubble-out, #6366f1)',
                      color: 'var(--bubble-out-text, #ffffff)',
                    }}
                    className="p-3 shadow-lg max-w-[85%]"
                  >
                    <p className="leading-relaxed">
                      Выглядит потрясающе: живые обои, плавные углы и моментальная кастомизация! ✨
                    </p>
                    <div className="flex items-center justify-end gap-1 text-[10px] opacity-80 mt-1">
                      <span>12:46</span>
                      <CheckCheck className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Demo Message 3: Incoming with Spoiler */}
                <div className="flex items-end gap-2 max-w-[85%]">
                  <Avatar name="Павел Дуров" size="sm" className="mb-0.5 shadow-sm" />
                  <div
                    style={{
                      borderRadius: `${settings.bubbleRadius}px`,
                      borderBottomLeftRadius: '4px',
                      backgroundColor: 'var(--bubble-in, #141d33)',
                      color: 'var(--bubble-in-text, #f8fafc)',
                    }}
                    className="p-3 shadow-md border border-white/5"
                  >
                    <p className="leading-relaxed">
                      А ещё спойлеры кликабельны: <Spoiler>Секретный код 42</Spoiler> 🔐
                    </p>
                    <span className="text-[10px] opacity-70 block text-right mt-1">
                      12:47
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. THEME PRESETS                                         */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2.5">
              1. Пресеты тем
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = settings.preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setThemePreset(opt.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-[var(--accent-default,#6366f1)] bg-[var(--accent-subtle,rgba(99,102,241,0.15))] shadow-md'
                        : 'border-[var(--border-subtle,rgba(255,255,255,0.08))] hover:border-white/20 bg-[var(--bg-input,#080c14)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        style={{ backgroundColor: opt.previewBg, borderColor: opt.previewAccent }}
                        className="w-5 h-5 rounded-full border-2 shrink-0 shadow-sm"
                      />
                      <span className="text-xs font-medium text-[var(--text-primary,#f8fafc)] truncate">
                        {opt.name}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--accent-default,#6366f1)] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 3. ACCENT COLOR                                          */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              2. Акцентный цвет
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((p) => {
                  const isSelected = settings.customAccent === p.color;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setCustomAccent(p.color)}
                      style={{ backgroundColor: p.color }}
                      className={`w-8 h-8 rounded-full shadow-md transition-all cursor-pointer flex items-center justify-center ${
                        isSelected ? 'ring-2 ring-white scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                      title={p.name}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCustomAccent(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    settings.customAccent === null
                      ? 'border-[var(--accent-default,#6366f1)] text-[var(--accent-default,#6366f1)] bg-[var(--accent-subtle,rgba(99,102,241,0.15))]'
                      : 'border-[var(--border-subtle,rgba(255,255,255,0.08))] text-[var(--text-secondary,#94a3b8)] hover:text-white'
                  }`}
                >
                  По теме
                </button>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block mb-2 font-medium">
                  Свой оттенок акцента:
                </span>
                <ColorPicker
                  value={settings.customAccent || '#6366f1'}
                  onChange={setCustomAccent}
                />
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 4. MESSAGE BUBBLES                                       */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              3. Кастомизация пузырей сообщений
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-4">
              <div>
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block mb-2 font-medium">
                  Цвет исходящих сообщений:
                </span>
                <div className="flex flex-wrap gap-2">
                  {BUBBLE_COLOR_PRESETS.map((bp) => {
                    const isSelected = settings.customBubbleOut === bp.value;
                    return (
                      <button
                        key={bp.name}
                        type="button"
                        onClick={() => setCustomBubbleOut(bp.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'border-white text-white shadow-md ring-2 ring-[var(--accent-default,#6366f1)]'
                            : 'border-[var(--border-subtle,rgba(255,255,255,0.08))] text-[var(--text-secondary,#94a3b8)] hover:text-white'
                        }`}
                        style={{
                          background: bp.value || 'var(--bubble-out, #6366f1)',
                        }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        <span className="text-white drop-shadow-sm">{bp.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
                <Slider
                  label="Скругление углов сообщений"
                  min={4}
                  max={20}
                  step={1}
                  value={settings.bubbleRadius}
                  onChange={setBubbleRadius}
                  displayValue={`${settings.bubbleRadius}px`}
                />
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 5. CHAT WALLPAPER                                        */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              4. Обои чата (Chat Wallpaper)
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-4">
              {/* Wallpaper presets */}
              <div>
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block mb-2 font-medium">
                  Пресеты фонов:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WALLPAPER_PRESETS.map((wp) => {
                    const isSelected = settings.wallpaper.value === wp.value && settings.wallpaper.type !== 'image';
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => setWallpaper({ ...settings.wallpaper, value: wp.value, type: wp.type })}
                        className={`h-16 rounded-xl border relative overflow-hidden transition-all cursor-pointer p-2 flex flex-col justify-end text-left ${
                          isSelected ? 'ring-2 ring-[var(--accent-default,#6366f1)] border-white' : 'border-white/10 hover:border-white/30'
                        }`}
                        style={{ background: wp.value }}
                      >
                        <span className="text-[11px] font-semibold text-white drop-shadow bg-black/40 px-1.5 py-0.5 rounded-md inline-block w-fit">
                          {wp.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pattern overlays */}
              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-3">
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block font-medium">
                  Узор поверх фона:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'none', label: 'Без узора' },
                    { id: 'stars', label: 'Звёзды (Stars)' },
                    { id: 'geometry', label: 'Сетка (Grid)' },
                    { id: 'subtle', label: 'Мягкое свечение' },
                  ].map((p) => {
                    const isSelected = (settings.wallpaper.pattern || 'stars') === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setWallpaper({ ...settings.wallpaper, pattern: p.id as any })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--accent-default,#6366f1)] text-white border-[var(--accent-default,#6366f1)] shadow-sm'
                            : 'bg-[var(--bg-surface,#141d33)] text-[var(--text-secondary,#94a3b8)] border-[var(--border-subtle,rgba(255,255,255,0.08))] hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {settings.wallpaper.pattern && settings.wallpaper.pattern !== 'none' && (
                  <Slider
                    label="Прозрачность узора"
                    min={5}
                    max={50}
                    step={1}
                    value={Math.round((settings.wallpaper.opacity ?? 0.15) * 100)}
                    onChange={(v: number) => setWallpaper({ ...settings.wallpaper, opacity: v / 100 })}
                    displayValue={`${Math.round((settings.wallpaper.opacity ?? 0.15) * 100)}%`}
                  />
                )}
              </div>

              {/* Custom Image Upload & Sliders */}
              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary,#94a3b8)] font-medium">
                    Собственное изображение:
                  </span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleCustomImageUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImageIcon className="w-3.5 h-3.5" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Загрузить фото
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Slider
                    label="Размытие фона (Blur)"
                    min={0}
                    max={20}
                    step={1}
                    value={settings.wallpaper.blur || 0}
                    onChange={(v: number) => setWallpaper({ ...settings.wallpaper, blur: v })}
                    displayValue={`${settings.wallpaper.blur || 0}px`}
                  />
                  <Slider
                    label="Затемнение (Dimming)"
                    min={0}
                    max={80}
                    step={5}
                    value={settings.wallpaper.dimming || 0}
                    onChange={(v: number) => setWallpaper({ ...settings.wallpaper, dimming: v })}
                    displayValue={`${settings.wallpaper.dimming || 0}%`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 6. TYPOGRAPHY & DENSITY                                   */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              5. Типографика и плотность
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-4">
              <Slider
                label="Размер шрифта сообщений"
                min={13}
                max={20}
                step={1}
                value={settings.fontSize}
                onChange={setFontSize}
                displayValue={`${settings.fontSize}px`}
              />

              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block mb-2 font-medium">
                  Плотность списка чатов:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'compact', label: 'Компактный' },
                    { id: 'normal', label: 'Стандартный' },
                    { id: 'spacious', label: 'Просторный' },
                  ].map((d) => {
                    const isSelected = settings.density === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDensity(d.id as ChatDensity)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[var(--accent-default,#6366f1)] text-white border-[var(--accent-default,#6366f1)] shadow-sm'
                            : 'bg-[var(--bg-surface,#141d33)] text-[var(--text-secondary,#94a3b8)] border-[var(--border-subtle,rgba(255,255,255,0.08))] hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
                <span className="text-xs text-[var(--text-secondary,#94a3b8)] block mb-2 font-medium">
                  Семейство шрифта:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'system', label: 'System UI', font: 'system-ui' },
                    { id: 'inter', label: 'Inter', font: 'sans-serif' },
                    { id: 'mono', label: 'Monospace', font: 'monospace' },
                  ].map((f) => {
                    const isSelected = settings.fontFamily === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFontFamily(f.id as FontFamily)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[var(--accent-default,#6366f1)] text-white border-[var(--accent-default,#6366f1)] shadow-sm'
                            : 'bg-[var(--bg-surface,#141d33)] text-[var(--text-secondary,#94a3b8)] border-[var(--border-subtle,rgba(255,255,255,0.08))] hover:text-white'
                        }`}
                        style={{ fontFamily: f.font }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 7. ANIMATIONS & EFFECTS                                  */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              6. Анимации и визуальные эффекты
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-3">
              {/* Animations */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary,#f8fafc)]">
                    Плавные анимации интерфейса
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                    Учитывает настройки prefers-reduced-motion
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAnimations(settings.animations === 'enabled' ? 'reduced' : 'enabled')}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    settings.animations === 'enabled' ? 'bg-[var(--accent-default,#6366f1)]' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                      settings.animations === 'enabled' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Glassmorphism */}
              <div className="pt-3 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary,#f8fafc)]">
                    Эффект стекла (Glassmorphism blur)
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                    Размытие панелей и плавающих плашек
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGlassmorphism(!settings.glassmorphism)}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    settings.glassmorphism ? 'bg-[var(--accent-default,#6366f1)]' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                      settings.glassmorphism ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 8. EXPORT / IMPORT & SYNC                                */}
          {/* ======================================================== */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              7. Экспорт, импорт и синхронизация
            </label>
            <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExport}
                >
                  Копировать JSON
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleDownloadTheme}
                >
                  Скачать .json
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Upload className="w-3.5 h-3.5" />}
                  onClick={() => setShowImportBox((prev) => !prev)}
                >
                  Импортировать
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={() => {
                    resetTheme();
                    toast.success('Настройки сброшены по умолчанию');
                  }}
                >
                  Сбросить
                </Button>

                <Button
                  size="sm"
                  variant="accent"
                  loading={syncingWithServer}
                  icon={<CloudUpload className="w-3.5 h-3.5" />}
                  onClick={handleSaveToCloud}
                >
                  Синхронизировать с профилем
                </Button>
              </div>

              {showImportBox && (
                <div className="p-3 bg-[var(--bg-surface,#141d33)] rounded-xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-2 mt-3 animate-in fade-in">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary,#94a3b8)] uppercase">
                    Вставьте JSON код темы:
                  </label>
                  <textarea
                    rows={4}
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder="Например: { &quot;preset&quot;: &quot;telegram-dark&quot;, ... }"
                    className="w-full p-2.5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs font-mono text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowImportBox(false)}>
                      Отмена
                    </Button>
                    <Button size="sm" variant="accent" onClick={handleImportSubmit}>
                      Применить тему
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'devices' ? (
        /* Active Devices & Sessions Tab */
        <div className="space-y-4 pb-2">
          {/* Header & Terminate All Others Button */}
          <div className="flex items-center justify-between gap-3 p-3.5 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))]">
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary,#f8fafc)] uppercase tracking-wider">Активные сеансы</h4>
              <p className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                Устройства, на которых выполнен вход в ваш аккаунт
              </p>
            </div>
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <Button
                size="sm"
                variant="danger"
                loading={revokingOther}
                icon={<LogOut className="w-3.5 h-3.5" />}
                onClick={async () => {
                  setRevokingOther(true);
                  try {
                    await revokeAllOtherSessions();
                    toast.success('Все другие сеансы успешно завершены');
                  } catch {
                    toast.error('Не удалось завершить сеансы');
                  } finally {
                    setRevokingOther(false);
                  }
                }}
              >
                Завершить все другие
              </Button>
            )}
          </div>

          {/* Sessions List */}
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] text-center text-xs text-[var(--text-secondary,#94a3b8)]">
                Загрузка списка устройств...
              </div>
            ) : (
              sessions.map((session) => {
                const isPhone = /Android|iOS|Mobile/i.test(session.deviceInfo);
                const isElectron = /Desktop|Electron/i.test(session.deviceInfo);

                return (
                  <div
                    key={session.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                      session.isCurrent
                        ? 'bg-[var(--accent-subtle,rgba(99,102,241,0.12))] border-[var(--accent-default,#6366f1)]/30'
                        : 'bg-[var(--bg-input,#080c14)] border-[var(--border-subtle,rgba(255,255,255,0.08))] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          session.isCurrent
                            ? 'bg-[var(--accent-default,#6366f1)]/20 text-[var(--accent-default,#6366f1)]'
                            : 'bg-white/5 text-[var(--text-muted,#94a3b8)]'
                        }`}
                      >
                        {isPhone ? (
                          <Smartphone className="w-5 h-5" />
                        ) : isElectron ? (
                          <Laptop className="w-5 h-5" />
                        ) : (
                          <Globe className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary,#f8fafc)] truncate">
                            {session.deviceInfo}
                          </span>
                          {session.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Текущий
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary,#94a3b8)] mt-0.5">
                          {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                          <span>•</span>
                          <span>
                            {session.isCurrent
                              ? 'Онлайн'
                              : `Активность: ${new Date(session.lastUsedAt).toLocaleDateString('ru-RU', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!session.isCurrent && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={async () => {
                          try {
                            await revokeSession(session.id);
                            toast.success('Сессия завершена');
                          } catch {
                            toast.error('Не удалось завершить сессию');
                          }
                        }}
                      >
                        Завершить
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Connect Mobile Option */}
          {onOpenPhoneConnect && (
            <div className="p-3.5 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-[var(--text-primary,#f8fafc)]">Связать устройство по QR</h5>
                  <p className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                    Мгновенный вход в приложении на телефоне
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={onOpenPhoneConnect}>
                QR-код
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Account Tab */
        <div className="space-y-5 pb-2">
          <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary,#f8fafc)]">Мобильное приложение (Android / PWA)</h4>
                <p className="text-xs text-[var(--text-secondary,#94a3b8)]">
                  Подключение по QR-коду и автономная работа
                </p>
              </div>
            </div>
            {onOpenPhoneConnect && (
              <Button size="sm" variant="accent" onClick={onOpenPhoneConnect}>
                Открыть QR
              </Button>
            )}
          </div>

          <div className="p-4 bg-[var(--bg-input,#080c14)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] space-y-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary,#f8fafc)]">Текущий пользователь</h4>
            <div className="text-xs text-[var(--text-secondary,#94a3b8)] space-y-1">
              <div>Отображаемое имя: <strong className="text-[var(--text-primary,#f8fafc)]">{currentUser?.displayName}</strong></div>
              <div>Логин: <strong className="text-[var(--text-primary,#f8fafc)]">@{currentUser?.username}</strong></div>
              {currentUser?.bio && <div>О себе: <span className="text-[var(--text-primary,#f8fafc)]">{currentUser.bio}</span></div>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
