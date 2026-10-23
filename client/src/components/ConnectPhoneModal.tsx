import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Copy, Check, QrCode } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import type { NetworkInfo } from '../types';

interface ConnectPhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectPhoneModal: React.FC<ConnectPhoneModalProps> = ({ isOpen, onClose }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getNetworkInfo()
        .then((info) => setNetworkInfo(info))
        .catch((err) => console.error('Network info error:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const currentHost = window.location.hostname;
  const currentPort = window.location.port || '5173';
  const targetIp = (networkInfo && networkInfo.localIp !== 'localhost') ? networkInfo.localIp : currentHost;
  const connectUrl = `http://${targetIp}:${currentPort}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(connectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Подключить телефон"
      subtitle="Мгновенный вход в мессенджер с Android или iOS"
      maxWidth="md"
    >
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--accent-default,#6366f1)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 flex flex-col items-center">
            <div className="bg-white p-3.5 rounded-2xl shadow-xl mb-3">
              <QRCodeSVG
                value={connectUrl}
                size={190}
                level="H"
                includeMargin={false}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <Wifi className="w-3.5 h-3.5" />
              <span>Устройства должны быть в одной локальной сети (Wi-Fi)</span>
            </div>
          </div>

          <div className="bg-black/20 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-[var(--accent-default,#a5b4fc)] truncate mr-2 select-all">
              {connectUrl}
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={handleCopy}
            >
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>

          <div className="bg-[var(--accent-subtle,rgba(99,102,241,0.1))] border border-[var(--accent-default,#6366f1)]/20 rounded-xl p-3.5 text-xs space-y-2 text-[var(--text-primary,#f8fafc)]">
            <div className="font-semibold text-[var(--accent-default,#818cf8)] flex items-center gap-1.5">
              <QrCode className="w-4 h-4" />
              <span>Инструкция по установке:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-secondary,#94a3b8)]">
              <li>Откройте камеру на смартфоне и наведите её на QR-код</li>
              <li>Перейдите по ссылке в браузере Chrome или Safari</li>
              <li>Нажмите в меню браузера «Установить на главный экран» (PWA)</li>
              <li>PulseChat установится как нативное приложение без сторонних магазинов!</li>
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
};
