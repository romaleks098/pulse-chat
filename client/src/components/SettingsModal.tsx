import React, { useState } from 'react';
import { useTheme, type ThemePreset, type ChatDensity } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Slider } from './ui/Slider';
import { ColorPicker } from './ui/ColorPicker';
import { Button } from './ui/Button';
import {
  Palette,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  Smartphone,
  Check,
  CheckCheck,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPhoneConnect?: () => void;
}

const PRESET_OPTIONS: { id: ThemePreset; name: string; previewBg: string; previewAccent: string; isDark: boolean }[] = [
  { id: 'classic-dark', name: 'Pulse Dark', previewBg: '#090d16', previewAccent: '#6366f1', isDark: true },
  { id: 'telegram-dark', name: 'Ночная Telegram', previewBg: '#0e1621', previewAccent: '#5288c1', isDark: true },
  { id: 'oled-black', name: 'OLED Чёрная', previewBg: '#000000', previewAccent: '#6366f1', isDark: true },
  { id: 'light', name: 'Светлая', previewBg: '#ffffff', previewAccent: '#3b82f6', isDark: false },
  { id: 'emerald', name: 'Изумруд', previewBg: '#06120d', previewAccent: '#10b981', isDark: true },
  { id: 'rose', name: 'Кибер Роза', previewBg: '#140912', previewAccent: '#f43f5e', isDark: true },
  { id: 'system', name: 'Авто (Системная)', previewBg: '#1e293b', previewAccent: '#6366f1', isDark: true },
];

const WALLPAPER_PRESETS: { id: string; name: string; type: 'pattern' | 'solid' | 'gradient'; value: string }[] = [
  { id: 'stars', name: 'Звёзды', type: 'pattern', value: 'stars' },
  { id: 'geometry', name: 'Геометрия', type: 'pattern', value: 'geometry' },
  { id: 'subtle', name: 'Свечение', type: 'pattern', value: 'subtle' },
  { id: 'solid-pure', name: 'Минимализм', type: 'solid', value: 'transparent' },
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
    setBubbleRadius,
    setFontSize,
    setDensity,
    setAnimations,
    setWallpaper,
    resetTheme,
    exportTheme,
    importTheme,
  } = useTheme();

  const { currentUser, updateProfile } = useChat();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'appearance' | 'account'>('appearance');
  const [importJson, setImportJson] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [syncingWithServer, setSyncingWithServer] = useState(false);

  const handleExport = () => {
    const json = exportTheme();
    navigator.clipboard.writeText(json);
    toast.success('Тема скопирована в буфер обмена в формате JSON');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Настройки"
      subtitle="Оформление и параметры интерфейса"
      icon={<Palette className="w-6 h-6" />}
      maxWidth="lg"
    >
      {/* Top Tabs */}
      <div className="flex p-1 bg-slate-950/60 rounded-2xl mb-6 border border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'appearance'
              ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
              : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Оформление</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'account'
              ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
              : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Устройство и Синхронизация</span>
        </button>
      </div>

      {activeTab === 'appearance' ? (
        <div className="space-y-6 pb-2">
          {/* Live Preview of Chat Bubble */}
          <div className="rounded-3xl p-4 bg-[var(--bg-chat,#070a12)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] relative overflow-hidden shadow-inner">
            <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted,#64748b)] mb-3 flex items-center justify-between">
              <span>Живой предпросмотр чата</span>
              <span className="text-[10px] text-emerald-400 font-mono">60 fps live</span>
            </div>

            <div className="space-y-3">
              {/* Incoming Bubble */}
              <div className="flex items-end gap-2 max-w-[85%]">
                <div
                  style={{
                    borderRadius: `${settings.bubbleRadius}px`,
                    borderBottomLeftRadius: '4px',
                    backgroundColor: 'var(--bubble-in, #141d33)',
                    color: 'var(--bubble-in-text, #f8fafc)',
                  }}
                  className="p-3 shadow-sm border border-white/5"
                >
                  <p className="text-xs leading-relaxed">
                    Привет! Как тебе новый стиль PulseChat в духе Telegram? 🚀
                  </p>
                  <span className="text-[10px] text-[var(--bubble-in-time,#94a3b8)] block text-right mt-1">
                    12:45
                  </span>
                </div>
              </div>

              {/* Outgoing Bubble */}
              <div className="flex items-end justify-end gap-2">
                <div
                  style={{
                    borderRadius: `${settings.bubbleRadius}px`,
                    borderBottomRightRadius: '4px',
                    backgroundColor: 'var(--bubble-out, #6366f1)',
                    color: 'var(--bubble-out-text, #ffffff)',
                  }}
                  className="p-3 shadow-md max-w-[85%]"
                >
                  <p className="text-xs leading-relaxed">
                    Выглядит шикарно: плавные анимации, чёткие токены и моментальная кастомизация! ✨
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-white/80 mt-1">
                    <span>12:46</span>
                    <CheckCheck className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 1. Theme Presets */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2.5">
              Цветовая тема
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
                        : 'border-white/10 hover:border-white/20 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        style={{ backgroundColor: opt.previewBg, borderColor: opt.previewAccent }}
                        className="w-5 h-5 rounded-full border-2 shrink-0 shadow-sm"
                      />
                      <span className="text-xs font-medium text-white truncate">{opt.name}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--accent-default,#6366f1)] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Custom Accent Color */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
              Акцентный цвет интерфейса
            </label>
            <ColorPicker
              value={settings.customAccent}
              onChange={(hex) => setCustomAccent(hex)}
            />
          </div>

          {/* 3. Sliders: Bubble Radius & Font Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-950/40 border border-white/10 rounded-2xl">
              <Slider
                label="Скругление пузырей"
                min={8}
                max={26}
                value={settings.bubbleRadius}
                displayValue={`${settings.bubbleRadius}px`}
                onChange={setBubbleRadius}
              />
            </div>

            <div className="p-3.5 bg-slate-950/40 border border-white/10 rounded-2xl">
              <Slider
                label="Размер шрифта"
                min={12}
                max={18}
                value={settings.fontSize}
                displayValue={`${settings.fontSize}px`}
                onChange={setFontSize}
              />
            </div>
          </div>

          {/* 4. Density, Wallpaper & Animations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
                Плотность
              </label>
              <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/10">
                {(['compact', 'normal', 'spacious'] as ChatDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                      settings.density === d
                        ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                        : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
                    }`}
                  >
                    {d === 'compact' ? 'Компакт' : d === 'spacious' ? 'Простор' : 'Стандарт'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
                Паттерн обоев
              </label>
              <div className="flex gap-1">
                {WALLPAPER_PRESETS.map((wp) => {
                  const isSelected = settings.wallpaper.value === wp.value;
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => setWallpaper({ ...settings.wallpaper, value: wp.value, type: wp.type })}
                      className={`flex-1 py-1.5 px-1 text-[11px] font-medium rounded-xl border transition-all text-center truncate ${
                        isSelected
                          ? 'border-[var(--accent-default,#6366f1)] bg-[var(--accent-subtle,rgba(99,102,241,0.15))] text-white'
                          : 'border-white/10 bg-slate-950/40 text-[var(--text-secondary,#94a3b8)] hover:text-white'
                      }`}
                    >
                      {wp.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-2">
                Анимации
              </label>
              <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/10">
                {(['enabled', 'reduced'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAnimations(mode)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      settings.animations === mode
                        ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-sm'
                        : 'text-[var(--text-secondary,#94a3b8)] hover:text-white'
                    }`}
                  >
                    {mode === 'enabled' ? 'Плавные' : 'Быстрые'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5. Theme Actions (Export / Import / Reset / Cloud Sync) */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleExport}
              >
                Экспорт JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => setShowImportBox((prev) => !prev)}
              >
                Импорт JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={resetTheme}
              >
                Сброс
              </Button>
            </div>

            <Button
              variant="primary"
              size="sm"
              loading={syncingWithServer}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={handleSaveToCloud}
            >
              Синхронизировать тему
            </Button>
          </div>

          {/* Import JSON Expandable Box */}
          {showImportBox && (
            <div className="p-3 bg-slate-950/80 rounded-2xl border border-white/10 animate-in fade-in space-y-2">
              <p className="text-xs text-[var(--text-secondary,#94a3b8)]">Вставьте JSON-код темы:</p>
              <textarea
                rows={3}
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"preset":"telegram-dark","customAccent":"#2481cc",...}'
                className="w-full p-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-[var(--accent-default,#6366f1)]"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowImportBox(false)}>
                  Отмена
                </Button>
                <Button size="sm" variant="primary" onClick={handleImportSubmit}>
                  Применить тему
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Account & Device Tab */
        <div className="space-y-5 pb-2">
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Мобильное приложение (Android / PWA)</h4>
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

          <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/10 space-y-2">
            <h4 className="text-sm font-semibold text-white">Текущий пользователь</h4>
            <div className="text-xs text-[var(--text-secondary,#94a3b8)] space-y-1">
              <div>Отображаемое имя: <strong className="text-white">{currentUser?.displayName}</strong></div>
              <div>Логин: <strong className="text-white">@{currentUser?.username}</strong></div>
              {currentUser?.bio && <div>О себе: <span className="text-white">{currentUser.bio}</span></div>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
