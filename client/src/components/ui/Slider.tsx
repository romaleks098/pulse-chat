import React from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  displayValue?: string | number;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  displayValue,
  className = '',
}) => {
  const percentage = Math.round(((value - min) / (max - min)) * 100);

  return (
    <div className={`space-y-1.5 select-none ${className}`}>
      {(label || displayValue !== undefined) && (
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary,#94a3b8)]">
          {label && <span className="font-medium">{label}</span>}
          {displayValue !== undefined && (
            <span className="font-mono text-[var(--text-primary,#f8fafc)] font-semibold">
              {displayValue}
            </span>
          )}
        </div>
      )}

      <div className="relative flex items-center h-5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, var(--accent-default, #6366f1) ${percentage}%, var(--border-subtle, rgba(255,255,255,0.15)) ${percentage}%)`,
          }}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-125"
        />
      </div>
    </div>
  );
};
