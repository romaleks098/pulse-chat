import React, { useState, useRef, useEffect } from 'react';
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
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || AVATAR_PRESETS[0]);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar cropping state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      setDisplayName(currentUser.displayName || '');
      setUsername(currentUser.username || '');
      setStatusText(currentUser.statusText || '');
      setBio(currentUser.bio || '');
      setAvatarUrl(currentUser.avatarUrl || AVATAR_PRESETS[0]);
      setError(null);
      setSavedSuccess(false);
      setCropImageSrc(null);
    }
  }, [isOpen, currentUser]);

  const handleCustomAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropZoom(1);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyCroppedAvatar = async () => {
    if (!cropImageSrc) return;
    setUploadingCustom(true);
    setError(null);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = cropImageSrc;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const size = 400;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // Calculate square center crop with zoom
      const minDim = Math.min(img.width, img.height);
      const cropSize = minDim / cropZoom;
      const startX = (img.width - cropSize) / 2;
      const startY = (img.height - cropSize) / 2;

      ctx.drawImage(img, startX, startY, cropSize, cropSize, 0, 0, size, size);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
      );

      if (!blob) throw new Error('Ошибка обработки фото');

      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const res = await api.uploadFile(croppedFile);
      setAvatarUrl(res.url);
      setCropImageSrc(null);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки фото');
    } finally {
      setUploadingCustom(false);
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
        bio: bio.trim(),
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
              onChange={handleCustomAvatarSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingCustom}
              title="Загрузить своё фото с обрезкой"
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

        {/* Circular Image Crop Overlay Modal */}
        {cropImageSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-200">
              <h3 className="text-sm font-bold text-white mb-1">Кадрирование фото</h3>
              <p className="text-xs text-slate-400 mb-4">Настройте масштаб круглой аватарки</p>

              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-indigo-500 shadow-xl bg-black mb-4 flex items-center justify-center">
                  <img
                    src={cropImageSrc}
                    alt="crop preview"
                    style={{ transform: `scale(${cropZoom})` }}
                    className="w-full h-full object-cover transition-transform duration-75 select-none pointer-events-none"
                  />
                </div>

                <div className="w-full max-w-xs space-y-1 mb-5">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Масштаб</span>
                    <span>{Math.round(cropZoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCropImageSrc(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={uploadingCustom}
                  onClick={handleApplyCroppedAvatar}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {uploadingCustom && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Применить</span>
                </button>
              </div>
            </div>
          </div>
        )}

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

          {/* Status text (short) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
              Краткий статус
            </label>
            <input
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="Например: На связи, В отпуске 🏖️"
              maxLength={50}
              className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] transition-colors"
            />
          </div>

          {/* Bio (About) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary,#94a3b8)] mb-1.5">
              О себе (Bio)
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Расскажите немного о себе (до 140 символов)..."
                maxLength={140}
                className="w-full px-3 py-2 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-xs text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-muted,#64748b)] focus:outline-none focus:border-[var(--accent-default,#6366f1)] resize-none transition-colors"
              />
            </div>
            <div className="text-right text-[10px] text-[var(--text-muted,#64748b)]">
              {bio.length}/140
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
