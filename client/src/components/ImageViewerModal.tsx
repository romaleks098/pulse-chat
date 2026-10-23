import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string | null;
  fileName?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ imageUrl, fileName, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="absolute top-4 right-4 flex items-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
        <a
          href={imageUrl}
          download={fileName || 'image.jpg'}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
          title="Скачать"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        className="max-w-5xl max-h-[85vh] flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={fileName || 'Enlarged view'}
          className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-slate-800"
        />
      </div>
    </div>
  );
};
