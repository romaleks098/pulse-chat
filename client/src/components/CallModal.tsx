import React, { useEffect, useRef } from 'react';
import { useCall } from '../context/CallContext';
import { useChat } from '../context/ChatContext';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Monitor,
  MonitorOff,
} from 'lucide-react';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const CallModal: React.FC = () => {
  const {
    callState,
    isVideo,
    callerInfo,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    callDuration,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
  } = useCall();

  const { activeConversation } = useChat();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attach local stream to video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOff]);

  // Attach remote stream to video
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === 'idle') return null;

  const partnerName = callerInfo?.name || activeConversation?.name || 'Собеседник';
  const partnerAvatar = callerInfo?.avatar || activeConversation?.avatarUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      {/* 1. Incoming Call Notification */}
      {callState === 'incoming' && (
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center text-white relative">
          <div className="relative mb-4">
            <span className="absolute -inset-2 rounded-full bg-indigo-500/30 animate-ping" />
            <img
              src={partnerAvatar}
              alt={partnerName}
              className="relative w-24 h-24 rounded-full border-2 border-indigo-500 bg-slate-800 object-cover shadow-xl"
            />
          </div>

          <h3 className="text-xl font-bold mb-1">{partnerName}</h3>
          <p className="text-xs text-indigo-300 font-medium mb-6 flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span>Входящий {isVideo ? 'видеозвонок' : 'аудиозвонок'}...</span>
          </p>

          <div className="flex items-center gap-6">
            <button
              onClick={rejectCall}
              title="Отклонить"
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform active:scale-95 cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            <button
              onClick={acceptCall}
              title="Ответить"
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 transition-transform active:scale-95 animate-pulse cursor-pointer"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Outgoing Call Screen (Calling) */}
      {callState === 'calling' && (
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center text-white relative">
          <div className="relative mb-4">
            <span className="absolute -inset-2 rounded-full bg-indigo-500/20 animate-pulse" />
            <img
              src={partnerAvatar}
              alt={partnerName}
              className="relative w-24 h-24 rounded-full border-2 border-slate-700 bg-slate-800 object-cover shadow-xl"
            />
          </div>

          <h3 className="text-xl font-bold mb-1">{partnerName}</h3>
          <p className="text-xs text-slate-400 mb-6">
            Вызов {isVideo ? '(видео)' : '(аудио)'}... Ожидание ответа
          </p>

          <button
            onClick={endCall}
            title="Отменить вызов"
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform active:scale-95 cursor-pointer"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 3. Connected Call Screen */}
      {callState === 'connected' && (
        <div className="w-full max-w-4xl h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative text-white">
          {/* Top Bar with partner info & duration */}
          <div className="p-4 bg-slate-950/60 backdrop-blur-md flex items-center justify-between z-10 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <img
                src={partnerAvatar}
                alt={partnerName}
                className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 object-cover"
              />
              <div>
                <div className="text-sm font-semibold">{partnerName}</div>
                <div className="text-xs text-emerald-400 font-mono">
                  {formatTimer(callDuration)}
                </div>
              </div>
            </div>

            <span className="text-xs px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-medium">
              WebRTC P2P Защищено
            </span>
          </div>

          {/* Main Media Area */}
          <div className="flex-1 bg-slate-950 flex items-center justify-center relative overflow-hidden">
            {isVideo && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <span className="absolute -inset-4 rounded-full bg-indigo-500/10 animate-ping" />
                  <img
                    src={partnerAvatar}
                    alt={partnerName}
                    className="relative w-32 h-32 rounded-full border-4 border-indigo-500/40 bg-slate-800 object-cover shadow-2xl"
                  />
                </div>
                <h4 className="text-lg font-bold">{partnerName}</h4>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {formatTimer(callDuration)}
                </p>
              </div>
            )}

            {/* Local Video Picture-in-Picture (PiP) */}
            {isVideo && (
              <div className="absolute top-4 right-4 w-32 sm:w-44 aspect-video bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-20">
                {!isVideoOff ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 bg-slate-900">
                    Камера выкл.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="p-4 bg-slate-950/80 backdrop-blur-md flex items-center justify-center gap-4 z-10 border-t border-slate-800/60">
            {/* Mic Mute */}
            <button
              onClick={toggleMute}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              className={`p-3.5 rounded-full transition-all active:scale-95 ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video Toggle */}
            {isVideo && (
              <button
                onClick={toggleVideo}
                title={isVideoOff ? 'Включить видео' : 'Выключить видео'}
                className={`p-3.5 rounded-full transition-all active:scale-95 cursor-pointer ${
                  isVideoOff
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Поделиться экраном'}
              className={`p-3.5 rounded-full transition-all active:scale-95 cursor-pointer ${
                isScreenSharing
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>

            {/* End Call */}
            <button
              onClick={endCall}
              title="Завершить звонок"
              className="p-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 transition-transform active:scale-95"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
