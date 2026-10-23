import React, { useState, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { api } from '../services/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import {
  User as UserIcon,
  Upload,
  Check,
  AlertCircle,
  AtSign,
} from 'lucide-react';

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

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, updateProfile } = useChat();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [statusText, setStatusText] = useState(currentUser?.statusText || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || AVATAR_PRESETS[0]);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCustom(true);
    setError(null);
    try {
      const res = await api.uploadFile(file);
      setAvatarUrl(res.url);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки фото');
    } finally {
      setUploadingCustom(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSavedSuccess(false);

    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        username: username.trim().replace(/^@/, '') || undefined,
        statusText: statusText.trim(),
        avatarUrl,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить профиль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Мой профиль"
      subtitle={`@${currentUser?.username}`}
      maxWidth="md"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* Avatar Section */}
        <div className="flex flex-col items-center">
          <div className="relative mb-3 group">
            <Avatar
              src={avatarUrl}
              name={displayName || currentUser?.displayName || 'User'}
              size="2xl"
              className="shadow-xl ring-4 ring-[var(--accent-default,#6366f1)]/30"
            />

            {/* Custom Photo Upload Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCustomAvatarUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingCustom}
              title="Загрузить своё фото"
              className="absolute bottom-0 right-0 p-2 rounded-full bg-[var(--accent-default,#6366f1)] text-white shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-[var(--bg-app,#090d16)]"
            >
              {uploadingCustom ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="text-xs text-[var(--text-secondary,#94a3b8)] mb-2.5">
            Галерея аватаров или загрузка своего фото:
          </p>

          {/* 4x2 Grid of Robot Presets */}
          <div className="grid grid-cols-4 gap-2.5 p-2 bg-black/20 rounded-2xl border border-white/5">
            {AVATAR_PRESETS.map((preset, idx) => {
              const isSelected = avatarUrl === preset;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className={`relative w-11 h-11 rounded-full p-0.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-[var(--accent-default,#6366f1)] scale-110 shadow-md bg-[var(--accent-subtle,rgba(99,102,241,0.2))]'
                      : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <img src={preset} alt={`avatar-${idx}`} className="w-full h-full rounded-full bg-slate-800 object-cover" />
                  {isSelected && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-default,#6366f1)] text-white flex items-center justify-center text-[9px] shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {savedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Профиль успешно обновлен!</span>
          </div>
        )}

        {/* Input Fields */}
        <div className="space-y-3.5">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
              Имя пользователя в чате
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
              />
            </div>
          </div>

          {/* Username (@handle) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
              Публичный юзернейм (@)
            </label>
            <div className="relative">
              <AtSign className="w-4 h-4 text-[var(--text-muted,#64748b)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] font-mono transition-colors"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted,#64748b)] mt-1">
              Позволяет другим людям находить вас по ссылке pulse.chat/@{username || 'username'}
            </p>
          </div>

          {/* Status / Bio */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
              О себе / Статус
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Напишите несколько слов о себе..."
                maxLength={140}
                className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] resize-none transition-colors"
              />
            </div>
            <div className="text-right text-[10px] text-[var(--text-muted,#64748b)]">
              {statusText.length}/140
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))]">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            loading={loading}
            icon={<Check className="w-4 h-4" />}
          >
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
};
