import React, { useState, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { MessageSquare, Lock, User as UserIcon, Sparkles, ArrowRight, Sun, Moon, X, AlertTriangle, KeyRound } from 'lucide-react';
import { startOAuthPKCE } from '../utils/pkce';
import { TelegramBotModal } from './TelegramBotModal';
import { TelegramCodeModal } from './TelegramCodeModal';

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Luna',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Leo',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Milo',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Alex',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Max',
];

export const AuthScreen: React.FC = () => {
  const { login, register, applyAuthenticatedSession } = useChat();
  const { resolvedTheme, setThemePreset } = useTheme();

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'telegram' | 'google' | 'github' | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get('oauth_error');
    if (oauthError) {
      if (oauthError === 'oauth_access_denied') {
        setError('Вход отменён пользователем или доступ запрещён (access_denied).');
      } else if (oauthError === 'oauth_state_mismatch') {
        setError('Ошибка проверки сессии безопасности (state mismatch). Пожалуйста, повторите попытку.');
      } else if (oauthError === 'oauth_exchange_failed') {
        setError('Ошибка обмена токена авторизации. Проверьте настройки OAuth в Render / Google Console.');
      } else {
        setError('Ошибка входа через социальную сеть. Попробуйте еще раз.');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await login({ username, password });
      } else {
        await register({
          username,
          password,
          displayName: displayName || username,
          avatarUrl: selectedAvatar,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setOauthLoading('google');
    setError(null);
    try {
      await startOAuthPKCE('google', {
        onSuccess: () => {
          setOauthLoading(null);
        },
        onError: (err) => {
          setOauthLoading(null);
          setError(err.message || 'Ошибка входа через Google');
        },
      });
    } catch (err: any) {
      setOauthLoading(null);
      setError(err.message || 'Ошибка запуска входа');
    }
  };

  const handleGithubClick = async () => {
    setOauthLoading('github');
    setError(null);
    try {
      await startOAuthPKCE('github', {
        onSuccess: () => {
          setOauthLoading(null);
        },
        onError: (err) => {
          setOauthLoading(null);
          setError(err.message || 'Ошибка входа через GitHub');
        },
      });
    } catch (err: any) {
      setOauthLoading(null);
      setError(err.message || 'Ошибка запуска входа');
    }
  };

  const handleTelegramClick = () => {
    setShowTelegramModal(true);
  };

  const toggleTheme = () => {
    if (resolvedTheme === 'dark') {
      setThemePreset('light');
    } else {
      setThemePreset('telegram-dark');
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app,#090d16)] text-[var(--text-primary,#f8fafc)] flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      {/* Background ambient gradient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[var(--accent-default,#6366f1)]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-[var(--accent-hover,#4f46e5)]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          title={resolvedTheme === 'dark' ? 'Включить светлую тему' : 'Включить ночную тему'}
          className="p-2.5 rounded-2xl bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] text-[var(--text-secondary,#cbd5e1)] hover:text-[var(--text-primary,#f8fafc)] shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 text-xs font-medium"
        >
          {resolvedTheme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Светлая тема</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-[var(--accent-default,#6366f1)]" />
              <span className="hidden sm:inline">Ночной режим</span>
            </>
          )}
        </button>
      </div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 backdrop-blur-xl">
        {/* App Logo & Header with Telegram-style animation */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative group cursor-pointer">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--accent-hover,#4f46e5)] to-[var(--accent-default,#6366f1)] flex items-center justify-center shadow-lg shadow-[var(--accent-default,#6366f1)]/30 mb-3 ring-4 ring-[var(--accent-default,#6366f1)]/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[var(--accent-default,#6366f1)]/50">
              <MessageSquare className="w-8 h-8 text-white transition-transform duration-300 group-hover:rotate-6" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-[var(--accent-default,#6366f1)]/20 blur opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary,#f8fafc)]">
            PulseChat
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary,#94a3b8)] mt-1">
            Мессенджер нового поколения в стиле Telegram
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 bg-[var(--bg-input,#0b101e)] rounded-2xl mb-6 border border-[var(--border-subtle,rgba(255,255,255,0.08))]">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
              isLogin
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
              !isLogin
                ? 'bg-[var(--accent-default,#6366f1)] text-white shadow-md'
                : 'text-[var(--text-secondary,#94a3b8)] hover:text-[var(--text-primary,#f8fafc)]'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 hover:text-rose-300 rounded-lg cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Social Login Buttons Bar */}
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-[var(--text-muted,#94a3b8)] uppercase tracking-wider text-center mb-3">
            Войти через соцсети
          </p>
          <div className="grid grid-cols-3 gap-2">
            {/* Telegram Button */}
            <button
              type="button"
              disabled={oauthLoading !== null}
              onClick={handleTelegramClick}
              className="py-2.5 px-2 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/30 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-[#229ED9] hover:text-[#229ED9] transition-all cursor-pointer group active:scale-95 disabled:opacity-50"
            >
              {oauthLoading === 'telegram' ? (
                <div className="w-4 h-4 border-2 border-[#229ED9] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
              )}
              <span>Telegram</span>
            </button>

            {/* Google Button */}
            <button
              type="button"
              disabled={oauthLoading !== null}
              onClick={handleGoogleClick}
              className="py-2.5 px-2 bg-white/10 hover:bg-white/15 border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-primary,#f8fafc)] transition-all cursor-pointer group active:scale-95 disabled:opacity-50"
            >
              {oauthLoading === 'google' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
              )}
              <span>Google</span>
            </button>

            {/* GitHub Button */}
            <button
              type="button"
              disabled={oauthLoading !== null}
              onClick={handleGithubClick}
              className="py-2.5 px-2 bg-white/5 hover:bg-white/10 border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-primary,#f8fafc)] transition-all cursor-pointer group active:scale-95 disabled:opacity-50"
            >
              {oauthLoading === 'github' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              )}
              <span>GitHub</span>
            </button>
          </div>

          {/* In-app Telegram 6-digit code login - ZERO BROWSER NEEDED */}
          <button
            type="button"
            onClick={() => setShowCodeModal(true)}
            className="w-full mt-2.5 py-2.5 px-3 bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-[#229ED9] hover:text-sky-300 transition-all cursor-pointer group active:scale-98 shadow-sm"
          >
            <KeyRound className="w-4 h-4 text-[#229ED9] group-hover:scale-110 transition-transform" />
            <span>Войти по 6-значному коду из Telegram</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#229ED9]/20 text-[#229ED9] uppercase tracking-wider font-bold">
              Без браузера
            </span>
          </button>

          <div className="relative flex items-center justify-center my-5">
            <div className="border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] w-full" />
            <span className="bg-[var(--bg-surface,#141d33)] px-3 text-[10px] uppercase tracking-wider text-[var(--text-muted,#94a3b8)] font-semibold absolute">
              или через логин и пароль
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary,#cbd5e1)] uppercase tracking-wider mb-2">
                Выберите аватар
              </label>
              <div className="grid grid-cols-4 gap-2 p-2 bg-[var(--bg-input,#0b101e)] rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))]">
                {AVATAR_PRESETS.map((avatar, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`w-11 h-11 mx-auto rounded-full p-0.5 transition-all cursor-pointer ${
                      selectedAvatar === avatar
                        ? 'ring-2 ring-[var(--accent-default,#6366f1)] scale-110 shadow-lg'
                        : 'opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    <img src={avatar} alt="Avatar" className="w-full h-full rounded-full bg-slate-800 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary,#cbd5e1)] uppercase tracking-wider mb-1.5">
                Отображаемое имя
              </label>
              <div className="relative">
                <Sparkles className="w-4 h-4 text-[var(--text-muted,#94a3b8)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Например: Роман"
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-input,#0b101e)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#94a3b8)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] focus:ring-1 focus:ring-[var(--accent-default,#6366f1)] transition-all text-xs sm:text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary,#cbd5e1)] uppercase tracking-wider mb-1.5">
              Имя пользователя (Логин)
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[var(--text-muted,#94a3b8)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="roman"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-input,#0b101e)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#94a3b8)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] focus:ring-1 focus:ring-[var(--accent-default,#6366f1)] transition-all text-xs sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary,#cbd5e1)] uppercase tracking-wider mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--text-muted,#94a3b8)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-input,#0b101e)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#94a3b8)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] focus:ring-1 focus:ring-[var(--accent-default,#6366f1)] transition-all text-xs sm:text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-[var(--accent-default,#6366f1)] to-[var(--accent-hover,#4f46e5)] hover:opacity-95 text-white font-semibold rounded-xl shadow-lg shadow-[var(--accent-default,#6366f1)]/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer text-xs sm:text-sm active:scale-98"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isLogin ? 'Войти в аккаунт' : 'Создать аккаунт'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] text-center">
          <p className="text-[11px] text-[var(--text-muted,#94a3b8)]">
            Поддерживает одновременную работу на ПК и мобильных Android-устройствах
          </p>
        </div>
      </div>

      <TelegramBotModal
        isOpen={showTelegramModal}
        onClose={() => setShowTelegramModal(false)}
        onSuccess={(data) => applyAuthenticatedSession(data)}
        onOpenCodeModal={() => setShowCodeModal(true)}
      />

      <TelegramCodeModal
        isOpen={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        onSuccess={(data) => applyAuthenticatedSession(data)}
      />
    </div>
  );
};
