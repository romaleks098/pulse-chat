import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../services/socket';

type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

interface CallerInfo {
  id: string;
  name: string;
  avatar: string;
}

interface CallContextType {
  callState: CallState;
  isVideo: boolean;
  activeConversationId: string | null;
  callerInfo: CallerInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  startCall: (conversationId: string, isVideo: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [callerInfo, setCallerInfo] = useState<CallerInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up WebRTC peer connection and streams
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallerInfo(null);
    setActiveConversationId(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
  }, []);

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback((convId: string) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendCallSignal(convId, {
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setCallState('connected');

        // Start call duration timer
        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      }
    };

    return pc;
  }, []);

  // Listen to Socket.io Call events
  useEffect(() => {
    // 1. Incoming Call
    const unsubIncoming = socketService.onCallIncoming((data) => {
      if (callState !== 'idle') {
        // Already on call or ringing, reject busy
        socketService.rejectCall(data.conversationId);
        return;
      }

      setActiveConversationId(data.conversationId);
      setIsVideo(data.isVideo);
      setCallerInfo({
        id: data.callerId,
        name: data.callerName,
        avatar: data.callerAvatar,
      });
      setCallState('incoming');
    });

    // 2. Call Accepted (Caller receives this)
    const unsubAccepted = socketService.onCallAccepted(async (data) => {
      if (callState !== 'calling' || data.conversationId !== activeConversationId) return;

      try {
        const pc = createPeerConnection(data.conversationId);

        // Add local tracks to peer connection
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        // Create and send SDP Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketService.sendCallSignal(data.conversationId, {
          type: 'offer',
          sdp: offer,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
        cleanup();
      }
    });

    // 3. Call Rejected
    const unsubRejected = socketService.onCallRejected(() => {
      cleanup();
    });

    // 4. Call Ended
    const unsubEnded = socketService.onCallEnded(() => {
      cleanup();
    });

    // 5. WebRTC Signaling (Offers, Answers, ICE Candidates)
    const unsubSignal = socketService.onCallSignal(async (data) => {
      const { signal, conversationId } = data;
      const pc = pcRef.current;

      if (!pc && signal.type !== 'offer') return;

      try {
        if (signal.type === 'offer') {
          // Receiver receives Offer
          const newPc = pc || createPeerConnection(conversationId);
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
              newPc.addTrack(track, localStreamRef.current!);
            });
          }

          await newPc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await newPc.createAnswer();
          await newPc.setLocalDescription(answer);

          socketService.sendCallSignal(conversationId, {
            type: 'answer',
            sdp: answer,
          });
        } else if (signal.type === 'answer') {
          // Caller receives Answer
          await pc?.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate' && signal.candidate) {
          // Both receive ICE Candidates
          await pc?.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      }
    });

    return () => {
      unsubIncoming();
      unsubAccepted();
      unsubRejected();
      unsubEnded();
      unsubSignal();
    };
  }, [callState, activeConversationId, cleanup, createPeerConnection]);

  // Start outgoing call
  const startCall = async (conversationId: string, withVideo: boolean) => {
    try {
      cleanup();
      setActiveConversationId(conversationId);
      setIsVideo(withVideo);
      setCallState('calling');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      socketService.startCall(conversationId, withVideo);
    } catch (err: any) {
      console.error('Failed to get media devices:', err);
      alert('Не удалось получить доступ к микрофону или камере: ' + (err.message || ''));
      cleanup();
    }
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!activeConversationId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      socketService.acceptCall(activeConversationId);
      setCallState('connected');
    } catch (err: any) {
      console.error('Failed to get media devices on accept:', err);
      alert('Не удалось получить доступ к микрофону или камере: ' + (err.message || ''));
      cleanup();
    }
  };

  // Reject incoming call
  const rejectCall = () => {
    if (activeConversationId) {
      socketService.rejectCall(activeConversationId);
    }
    cleanup();
  };

  // End active call
  const endCall = () => {
    if (activeConversationId) {
      socketService.endCall(activeConversationId);
    }
    cleanup();
  };

  // Mute / Unmute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Video on / off
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <CallContext.Provider
      value={{
        callState,
        isVideo,
        activeConversationId,
        callerInfo,
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        callDuration,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
