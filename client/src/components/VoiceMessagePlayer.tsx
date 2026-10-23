import React, { useState, useRef, useEffect, useId } from 'react';
import { Play, Pause } from 'lucide-react';

const activeAudioEmitter = new EventTarget();

interface VoiceMessagePlayerProps {
  audioUrl?: string | null;
  duration?: number;
  isOwn?: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({ audioUrl, duration, isOwn = false }) => {
  const playerId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const safeUrl = typeof audioUrl === 'string' ? audioUrl : '';

  useEffect(() => {
    if (duration && duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  useEffect(() => {
    if (!safeUrl) return;

    const audio = new Audio(safeUrl);
    audioRef.current = audio;

    const onMeta = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const onTime = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    const onOtherPlay = (e: any) => {
      if (e.detail !== playerId && audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    activeAudioEmitter.addEventListener('voice:play', onOtherPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      activeAudioEmitter.removeEventListener('voice:play', onOtherPlay);
      audioRef.current = null;
    };
  }, [safeUrl, playerId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      activeAudioEmitter.dispatchEvent(new CustomEvent('voice:play', { detail: playerId }));
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = progress * totalDuration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleSpeed = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) : 0;
  // Generate 28 pseudo waveform bars based on audioUrl hash
  const bars = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < safeUrl.length; i++) hash = (hash << 5) - hash + safeUrl.charCodeAt(i);
    return Array.from({ length: 26 }).map((_, idx) => {
      const val = Math.abs(Math.sin((idx + 1) * 1.35 + hash) * 0.72) + 0.28;
      return Math.round(val * 24);
    });
  }, [safeUrl]);

  if (!safeUrl) {
    return (
      <div className="text-xs opacity-60 italic py-1 px-2">
        Аудиозапись недоступна
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 py-1.5 px-2 rounded-2xl min-w-[230px] max-w-[290px] sm:max-w-[330px] select-none ${
      isOwn ? 'text-white' : 'text-slate-200'
    }`}>
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Пауза' : 'Слушать голосовое'}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 cursor-pointer ${
          isOwn
            ? 'bg-white text-indigo-600 hover:bg-slate-100'
            : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Waveform & Timing */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        <div
          role="slider"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={currentTime}
          className="flex items-center gap-[3px] h-6 cursor-pointer py-1"
          onClick={handleSeek}
        >
          {bars.map((height, idx) => {
            const barProgress = idx / bars.length;
            const isPlayed = barProgress <= progress;
            return (
              <span
                key={idx}
                style={{ height: `${height}px` }}
                className={`w-[3px] rounded-full transition-colors duration-100 ${
                  isPlayed
                    ? isOwn ? 'bg-white' : 'bg-indigo-400'
                    : isOwn ? 'bg-white/35' : 'bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] opacity-85 font-mono">
          <span>{formatTime(isPlaying ? currentTime : (totalDuration || 0))}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSpeed();
            }}
            aria-label={`Скорость воспроизведения ${playbackRate}x`}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              playbackRate !== 1
                ? (isOwn ? 'bg-white text-indigo-600' : 'bg-indigo-500 text-white')
                : (isOwn ? 'bg-indigo-600/60 text-white' : 'bg-slate-800 text-slate-300 hover:text-white')
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
