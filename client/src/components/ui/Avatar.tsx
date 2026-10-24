import React, { useState } from 'react';
import { Bookmark, Radio, Users } from 'lucide-react';
import { resolveAssetUrl } from '../../config/runtime';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isOnline?: boolean;
  isSaved?: boolean;
  isChannel?: boolean;
  isGroup?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: { container: 'w-6 h-6 text-[10px]', icon: 'w-3 h-3', dot: 'w-2 h-2' },
  sm: { container: 'w-8 h-8 text-xs', icon: 'w-4 h-4', dot: 'w-2.5 h-2.5' },
  md: { container: 'w-10 h-10 text-sm', icon: 'w-5 h-5', dot: 'w-3 h-3' },
  lg: { container: 'w-12 h-12 text-base', icon: 'w-6 h-6', dot: 'w-3.5 h-3.5' },
  xl: { container: 'w-16 h-16 text-xl', icon: 'w-8 h-8', dot: 'w-4 h-4' },
  '2xl': { container: 'w-20 h-20 text-2xl', icon: 'w-10 h-10', dot: 'w-5 h-5' },
};

// Generates a consistent pleasant gradient based on the name string
const GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-fuchsia-500 to-rose-600',
];

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getGradientIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % GRADIENTS.length;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isOnline = false,
  isSaved = false,
  isChannel = false,
  isGroup = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const sizeConfig = SIZE_MAP[size];

  // 1. Saved messages avatar
  if (isSaved) {
    return (
      <div className="relative shrink-0 select-none">
        <div
          className={`${sizeConfig.container} rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md ${className}`}
        >
          <Bookmark className={`${sizeConfig.icon} fill-current`} />
        </div>
      </div>
    );
  }

  // 2. Regular user / group / channel avatar
  const initials = getInitials(name);
  const gradientClass = GRADIENTS[getGradientIndex(name)];

  return (
    <div className={`relative shrink-0 select-none ${className}`}>
      {src && !imgError ? (
        <img
          src={resolveAssetUrl(src)}
          alt={name}
          onError={() => setImgError(true)}
          className={`${sizeConfig.container} rounded-full object-cover bg-slate-800 border border-white/10 shadow-sm`}
        />
      ) : (
        <div
          className={`${sizeConfig.container} rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-white font-bold tracking-wider shadow-sm border border-white/10`}
        >
          {isChannel ? (
            <Radio className={sizeConfig.icon} />
          ) : isGroup ? (
            <Users className={sizeConfig.icon} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
      )}

      {/* Status indicator */}
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 ${sizeConfig.dot} rounded-full bg-emerald-500 border-2 border-slate-900 shadow-sm`}
          title="В сети"
        />
      )}
    </div>
  );
};
