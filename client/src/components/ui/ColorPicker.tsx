import React, { useRef } from 'react';
import { Check, Pipette } from 'lucide-react';

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
  className?: string;
}

const PRESET_ACCENTS = [
  { name: 'Индиго Pulse', hex: '#6366f1' },
  { name: 'Синий Telegram', hex: '#2481cc' },
  { name: 'Голубой океан', hex: '#0ea5e9' },
  { name: 'Изумруд', hex: '#10b981' },
  { name: 'Золотой янтарь', hex: '#f59e0b' },
  { name: 'Фиолетовый', hex: '#8b5cf6' },
  { name: 'Неоновая роза', hex: '#f43f5e' },
  { name: 'Коралловый', hex: '#ef4444' },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={`space-y-2 select-none ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_ACCENTS.map((item) => {
          const isSelected = (value || '#6366f1').toLowerCase() === item.hex.toLowerCase();

          return (
            <button
              key={item.hex}
              type="button"
              title={item.name}
              onClick={() => onChange(item.hex)}
              style={{ backgroundColor: item.hex }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shadow-md ${
                isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105' : 'opacity-90'
              }`}
            >
              {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
            </button>
          );
        })}

        {/* Custom native color picker button */}
        <div className="relative">
          <button
            type="button"
            title="Свой цвет"
            onClick={() => nativeInputRef.current?.click()}
            className="w-8 h-8 rounded-full border border-dashed border-slate-600 hover:border-white flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <Pipette className="w-4 h-4" />
          </button>
          <input
            ref={nativeInputRef}
            type="color"
            value={value || '#6366f1'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
          />
        </div>

        {/* Reset to preset default button */}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-[var(--text-secondary,#94a3b8)] hover:text-white ml-2 underline cursor-pointer"
          >
            Сбросить цвет
          </button>
        )}
      </div>
    </div>
  );
};
