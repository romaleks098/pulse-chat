import React, { useState, useEffect, useRef } from 'react';
import { KeyRound, Send, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { api } from '../services/api';

interface TelegramCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { token: string; refreshToken?: string; user: any }) => void;
  botUsername?: string;
}

export const TelegramCodeModal: React.FC<TelegramCodeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  botUsername = 'PulseChatBot',
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError(null);
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleOpenBot = () => {
    const cleanBot = botUsername.replace(/^@/, '');
    const tgLink = `tg://resolve?domain=${cleanBot}&start=login`;
    const webLink = `https://t.me/${cleanBot}`;

    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(tgLink);
    } else {
      window.location.href = tgLink;
      setTimeout(() => {
        if (!document.hidden) {
          window.open(webLink, '_blank');
        }
      }, 1200);
    }
  };

  const handleVerify = async (codeToVerify?: string) => {
    const targetCode = (codeToVerify || code).replace(/\D/g, '').trim();
    if (targetCode.length !== 6) {
      setError('Введите все 6 цифр кода');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyLoginCode(targetCode);
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Неверный код или срок его действия истёк');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    if (error) setError(null);

    // Auto-submit when user reaches 6 digits
    if (val.length === 6) {
      handleVerify(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Вход по коду из Telegram"
      subtitle="Быстрый вход без открытия браузера"
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Step 1 Box: Open Bot */}
        <div className="bg-[var(--bg-input,#080c14)] p-4 rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--accent-default,#6366f1)] uppercase tracking-wider">
              Шаг 1: Получите код
            </span>
            <button
              type="button"
              onClick={handleOpenBot}
              className="text-xs text-[#229ED9] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Открыть @{botUsername.replace(/^@/, '')}</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary,#94a3b8)] leading-relaxed">
            Отправьте нашему боту команду <code className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono font-bold">/code</code> или просто напишите <code className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono font-bold">/start</code>. Бот моментально пришлёт вам 6-значный код безопасности.
          </p>
        </div>

        {/* Step 2 Box: Code Input */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary,#cbd5e1)] uppercase tracking-wider mb-2">
            Шаг 2: Введите 6-значный код
          </label>

          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <KeyRound className="w-5 h-5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              className="w-full pl-12 pr-4 py-3.5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.12))] rounded-2xl text-center text-2xl font-mono tracking-[0.4em] text-[var(--text-primary,#f8fafc)] placeholder-slate-600 focus:outline-none focus:border-[var(--accent-default,#6366f1)] focus:ring-2 focus:ring-[var(--accent-default,#6366f1)]/20 transition-all"
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={() => handleVerify()}
          disabled={loading || code.length !== 6}
          className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Войти в PulseChat</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>

        {/* Security badge */}
        <div className="p-3 rounded-xl bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.06))] text-xs text-[var(--text-secondary,#94a3b8)] flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Код действует 10 минут и может быть использован только один раз. Вход происходит полностью внутри приложения.
          </span>
        </div>
      </div>
    </Modal>
  );
};
