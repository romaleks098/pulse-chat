import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { X, User as UserIcon, Sparkles, Smile, Check } from 'lucide-react';

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
  const [statusText, setStatusText] = useState(currentUser?.statusText || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || AVATAR_PRESETS[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      await updateProfile({
        displayName,
        statusText,
        avatarUrl,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Update profile error:', err);
    } finally {
      setLoading(false);
    }
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

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Мой профиль</h2>
            <p className="text-xs text-slate-400">@{currentUser.username}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col items-center pb-2">
            <div className="relative mb-3">
              <img
                src={avatarUrl}
                alt="Profile Avatar"
                className="w-20 h-20 rounded-full border-2 border-indigo-500/40 bg-slate-800 p-0.5 shadow-lg object-cover"
              />
            </div>
            <p className="text-xs text-slate-400 mb-2">Выберите аватар из галереи:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className={`w-9 h-9 rounded-full p-0.5 transition-all ${
                    avatarUrl === preset
                      ? 'ring-2 ring-indigo-500 scale-110 shadow-md'
                      : 'opacity-60 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <img src={preset} alt="preset" className="w-full h-full rounded-full bg-slate-800" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Отображаемое имя
            </label>
            <div className="relative">
              <Sparkles className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Статус / О себе
            </label>
            <div className="relative">
              <Smile className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="На связи / На встрече..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {success ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Сохранено!</span>
                </>
              ) : loading ? (
                <span>Сохранение...</span>
              ) : (
                <span>Сохранить</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
