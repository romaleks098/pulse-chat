import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Wifi, Copy, Check, QrCode } from 'lucide-react';
import { api } from '../services/api';
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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-200">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Подключить Android / Телефон</h2>
            <p className="text-xs text-slate-400">Мгновенный вход с мобильного устройства</p>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col items-center">
              <div className="bg-white p-3.5 rounded-2xl shadow-md mb-3">
                <QRCodeSVG
                  value={connectUrl}
                  size={190}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <Wifi className="w-3.5 h-3.5" />
                <span>Устройства должны быть в одной Wi-Fi сети</span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-indigo-300 truncate mr-2">{connectUrl}</span>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>

            <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-3.5 text-xs space-y-2 text-slate-300">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <QrCode className="w-4 h-4" />
                <span>Как открыть на Android:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Наведите камеру смартфона на QR-код или откройте ссылку в Chrome</li>
                <li>В меню браузера (три точки) нажмите <strong className="text-white">"Установить приложение"</strong></li>
                <li>Мессенджер появится на главном экране как нативное приложение!</li>
              </ol>
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
