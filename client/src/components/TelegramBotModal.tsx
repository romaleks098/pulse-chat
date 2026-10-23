import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, Copy, Check, RefreshCw, Send, ShieldCheck, Globe } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { api } from '../services/api';
import { generateCodeVerifier, generateCodeChallenge, startOAuthPKCE } from '../utils/pkce';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface TelegramBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { token: string; refreshToken?: string; user: any }) => void;
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [botSession, setBotSession] = useState<{ token: string; botName: string; deepLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Ожидаем нажатия «Запустить» в Telegram...');
  
  const verifierRef = useRef<string>('');
  const socketRef = useRef<Socket | null>(null);
  const pollIntervalRef = useRef<any>(null);

  const initSession = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatusText('Создание защищенной сессии...');

      // 1. Generate PKCE pair
      const verifier = generateCodeVerifier(64);
      verifierRef.current = verifier;
      const challenge = await generateCodeChallenge(verifier);
      const state = generateCodeVerifier(16);

      // 2. Request Telegram bot auth session
      const redirectUri = `${window.location.origin}/auth/callback`;
      const session = await api.createTelegramBotSession(challenge, 'S256', redirectUri, state);
      setBotSession(session);
      setStatusText('Ожидаем подтверждения в боте...');

      // 3. Connect anonymous socket to listen for auth confirmation
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const sock = io(SOCKET_URL, {
        auth: { anonymousAuth: true },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = sock;

      sock.on('connect', () => {
        sock.emit('telegram_auth_listen', session.token);
      });

      sock.on('telegram_auth_success', async (data: { code: string; state?: string; user: any }) => {
        try {
          setStatusText('Авторизация подтверждена! Завершаем вход...');
          const exchangeRes = await api.exchangeAuthCode(data.code, verifierRef.current, redirectUri);
          onSuccess(exchangeRes);
          onClose();
        } catch (err: any) {
          setError(err.message || 'Ошибка подтверждения авторизации');
        }
      });

      // 4. Fallback polling every 2.5s in case socket is blocked
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const check = await api.checkTelegramBotSession(session.token);
          if (check.status === 'completed' && check.code) {
            clearInterval(pollIntervalRef.current);
            setStatusText('Авторизация подтверждена! Завершаем вход...');
            const exchangeRes = await api.exchangeAuthCode(check.code, verifierRef.current, redirectUri);
            onSuccess(exchangeRes);
            onClose();
          }
        } catch (_) {}
      }, 2500);

    } catch (err: any) {
      console.error('Telegram bot init error:', err);
      setError(err.message || 'Не удалось связаться с сервером');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      initSession();
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen]);

  const handleCopyLink = () => {
    if (!botSession) return;
    navigator.clipboard.writeText(botSession.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenBrowserOAuth = () => {
    onClose();
    startOAuthPKCE('telegram');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Вход через Telegram"
      subtitle="Быстрый и безопасный вход через официального бота без пароля"
      maxWidth="md"
    >
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">{statusText}</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center space-y-4">
          <div className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
            {error}
          </div>
          <Button onClick={initSession} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Попробовать снова
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* QR Code Container */}
          <div className="bg-[var(--bg-input,#080c14)] p-5 rounded-2xl border border-[var(--border-subtle,rgba(255,255,255,0.08))] flex flex-col items-center">
            <div className="bg-white p-3.5 rounded-2xl shadow-xl mb-3 relative group">
              {botSession && (
                <QRCodeSVG
                  value={botSession.deepLink}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary,#94a3b8)] mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{statusText}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            {botSession && (
              <a
                href={botSession.deepLink}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 px-4 bg-[#229ED9] hover:bg-[#1f8ec4] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#229ED9]/25 transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Открыть Telegram (@{botSession.botName || 'PulseChatBot'})</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all border border-slate-700/60"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано!' : 'Копировать ссылку'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenBrowserOAuth}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all border border-slate-700/60"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Веб-страница</span>
              </button>
            </div>
          </div>

          {/* Instruction helper */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] text-xs text-[var(--text-secondary,#94a3b8)] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Вам не нужно вводить пароль. После нажатия <strong>/start</strong> в Telegram сессия подтвердится мгновенно по WebSocket.
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
};
