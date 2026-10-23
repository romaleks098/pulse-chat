import React, { useState, useRef, useEffect } from 'react';
import { Mic, Trash2, Send } from 'lucide-react';
import { api } from '../services/api';
import { soundService } from '../services/sound';

interface VoiceRecorderProps {
  onSendVoice: (fileUrl: string, duration: number) => void;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendVoice, disabled = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    if (disabled || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Пожалуйста, разрешите доступ к микрофону для записи голосового сообщения');
    }
  };

  const stopAndCleanStream = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopAndCleanStream();
    setRecordingDuration(0);
  };

  const finishAndSend = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const finalDuration = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
      stopAndCleanStream();
      setUploading(true);

      try {
        const uploadRes = await api.uploadFile(audioBlob, `voice_${Date.now()}.webm`);
        onSendVoice(uploadRes.url, finalDuration);
        soundService.playMessageSent();
      } catch (err) {
        console.error('Failed to upload voice message:', err);
        alert('Не удалось отправить голосовое сообщение');
      } finally {
        setUploading(false);
        setRecordingDuration(0);
      }
    };

    mediaRecorderRef.current.stop();
  };

  useEffect(() => {
    return () => {
      stopAndCleanStream();
    };
  }, []);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (uploading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-indigo-400 font-medium animate-pulse">
        <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span>Отправка голосового...</span>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs font-mono font-semibold text-red-400 min-w-[36px]">
            {formatTimer(recordingDuration)}
          </span>
        </div>

        {/* Animated Soundwave Indicator */}
        <div className="flex items-center gap-0.5 h-4">
          <span className="w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s] h-3" />
          <span className="w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s] h-4" />
          <span className="w-1 bg-red-500 rounded-full animate-bounce h-2" />
          <span className="w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.2s] h-3.5" />
        </div>

        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={cancelRecording}
            title="Отменить запись"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={finishAndSend}
            title="Отправить голосовое"
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-transform active:scale-95 shadow-md shadow-indigo-600/30 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      title="Записать голосовое сообщение"
      className="p-2.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
};
