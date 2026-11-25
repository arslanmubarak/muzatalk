import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import type { CallType } from '../../shared/types';

export interface ActiveCallState {
  callId: string;
  direction: 'outgoing' | 'incoming';
  peerUserId: string | null;
  peerName: string;
  peerAvatar: string | null;
  type: CallType;
  status: 'ringing' | 'connecting' | 'active' | 'ended';
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  durationSec: number;
  error?: string | null;
}

export function useWebRTC(currentUserId: string | null, onCallEnded?: () => void) {
  const [callState, setCallState] = useState<ActiveCallState | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<{ callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit } | null>(null);
  const callStateRef = useRef<ActiveCallState | null>(null);
  callStateRef.current = callState;

  // Call duration timer
  useEffect(() => {
    if (!callState || callState.status !== 'active') return;
    const id = window.setInterval(() => {
      setCallState((prev) => (prev ? { ...prev, durationSec: prev.durationSec + 1 } : null));
    }, 1000);
    return () => window.clearInterval(id);
  }, [callState?.status]);

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      remoteStreamRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;
    if (localVideoElRef.current) localVideoElRef.current.srcObject = null;
    if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = null;
  }, []);

  const attachStreamsToVideos = useCallback(() => {
    if (localVideoElRef.current && localStreamRef.current) {
      if (localVideoElRef.current.srcObject !== localStreamRef.current) {
        localVideoElRef.current.srcObject = localStreamRef.current;
      }
      localVideoElRef.current.muted = true;
      localVideoElRef.current.play().catch(() => {});
    }
    if (remoteVideoElRef.current && remoteStreamRef.current) {
      if (remoteVideoElRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoElRef.current.srcObject = remoteStreamRef.current;
      }
      remoteVideoElRef.current.muted = false;
      remoteVideoElRef.current.play().catch(() => {});
    }
  }, []);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const queue = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const candidate of queue) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }, []);

  const createPeerConnection = useCallback(
    async (callId: string, peerUserId: string | null, isVideo: boolean) => {
      const iceCfg = await api.getIceConfig().catch(() => ({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      }));
      const pc = new RTCPeerConnection({ iceServers: iceCfg.iceServers });
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      pc.ontrack = (evt) => {
        const tracks = evt.streams?.[0]?.getTracks() ?? (evt.track ? [evt.track] : []);
        for (const track of tracks) {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
        setStreamVersion((v) => v + 1);
        attachStreamsToVideos();
      };

      pc.onicecandidate = (evt) => {
        if (evt.candidate && peerUserId) {
          getSocket()?.emit('call:ice_candidate', {
            callId,
            toUserId: peerUserId,
            candidate: evt.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState((prev) => (prev ? { ...prev, status: 'active' } : null));
          attachStreamsToVideos();
        }
      };

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          });
          localStreamRef.current = stream;
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          setStreamVersion((v) => v + 1);
          attachStreamsToVideos();
        }
      } catch {
        setCallState((prev) =>
          prev
            ? {
                ...prev,
                error: 'Microphone/camera access unavailable in this browser context; signaling remains active.',
              }
            : null
        );
      }

      return pc;
    },
    [attachStreamsToVideos]
  );

  const processOffer = useCallback(
    async (payload: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const cur = callStateRef.current;
      const isVideo = cur ? cur.type === 'VIDEO' || cur.type === 'GROUP_VIDEO' : true;
      const pc = pcRef.current || (await createPeerConnection(payload.callId, payload.fromUserId, isVideo));
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call:answer', { callId: payload.callId, toUserId: payload.fromUserId, sdp: answer });
      setStreamVersion((v) => v + 1);
      attachStreamsToVideos();
    },
    [attachStreamsToVideos, createPeerConnection, flushPendingIce]
  );

  const startCall = useCallback(
    async (params: {
      peerUserId: string | null;
      peerName: string;
      peerAvatar: string | null;
      conversationId: string | null;
      type: CallType;
    }) => {
      const { call } = await api.startCall({
        peerId: params.peerUserId,
        conversationId: params.conversationId,
        type: params.type,
      });

      const isVideo = params.type === 'VIDEO' || params.type === 'GROUP_VIDEO';
      setCallState({
        callId: call.id,
        direction: 'outgoing',
        peerUserId: params.peerUserId,
        peerName: params.peerName,
        peerAvatar: params.peerAvatar,
        type: params.type,
        status: 'ringing',
        isMuted: false,
        isVideoOff: !isVideo,
        isSpeakerOn: isVideo,
        durationSec: 0,
      });

      const pc = await createPeerConnection(call.id, params.peerUserId, isVideo);
      if (params.peerUserId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        getSocket()?.emit('call:offer', {
          callId: call.id,
          toUserId: params.peerUserId,
          sdp: offer,
        });
      } else {
        setCallState((prev) => (prev ? { ...prev, status: 'active' } : null));
      }
    },
    [createPeerConnection]
  );

  const acceptIncomingCall = useCallback(async () => {
    const cur = callStateRef.current;
    if (!cur || !cur.peerUserId) return;

    const isVideo = cur.type === 'VIDEO' || cur.type === 'GROUP_VIDEO';
    setCallState((prev) => (prev ? { ...prev, status: 'connecting' } : null));
    getSocket()?.emit('call:accept', { callId: cur.callId, toUserId: cur.peerUserId });

    if (!pcRef.current) {
      await createPeerConnection(cur.callId, cur.peerUserId, isVideo);
    }
    if (pendingOfferRef.current && pendingOfferRef.current.callId === cur.callId) {
      const offer = pendingOfferRef.current;
      pendingOfferRef.current = null;
      await processOffer(offer);
    }
    setCallState((prev) => (prev ? { ...prev, status: 'active' } : null));
    attachStreamsToVideos();
  }, [attachStreamsToVideos, createPeerConnection, processOffer]);

  const rejectIncomingCall = useCallback(async () => {
    const cur = callStateRef.current;
    if (!cur) return;
    if (cur.peerUserId) {
      getSocket()?.emit('call:reject', { callId: cur.callId, toUserId: cur.peerUserId });
    }
    await api.endCall(cur.callId).catch(() => {});
    cleanupPeer();
    setCallState(null);
    onCallEnded?.();
  }, [cleanupPeer, onCallEnded]);

  const hangupCall = useCallback(async () => {
    const cur = callStateRef.current;
    if (!cur) return;
    getSocket()?.emit('call:end', { callId: cur.callId, toUserId: cur.peerUserId || undefined });
    await api.endCall(cur.callId).catch(() => {});
    cleanupPeer();
    setCallState(null);
    onCallEnded?.();
  }, [cleanupPeer, onCallEnded]);

  const toggleMute = useCallback(() => {
    setCallState((prev) => {
      if (!prev) return null;
      const next = !prev.isMuted;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return { ...prev, isMuted: next };
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setCallState((prev) => {
      if (!prev) return null;
      const nextOff = !prev.isVideoOff;
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = !nextOff;
      });
      return { ...prev, isVideoOff: nextOff };
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setCallState((prev) => (prev ? { ...prev, isSpeakerOn: !prev.isSpeakerOn } : null));
  }, []);

  // Listen to WebRTC Socket.IO signaling
  useEffect(() => {
    if (!currentUserId) return;
    const socket = getSocket();
    if (!socket) return;

    const handleIncoming = (payload: {
      callId: string;
      fromUserId: string;
      fromName: string;
      fromAvatar: string | null;
      type: CallType;
    }) => {
      if (callStateRef.current) return; // busy
      const isVideo = payload.type === 'VIDEO' || payload.type === 'GROUP_VIDEO';
      setCallState({
        callId: payload.callId,
        direction: 'incoming',
        peerUserId: payload.fromUserId,
        peerName: payload.fromName,
        peerAvatar: payload.fromAvatar,
        type: payload.type,
        status: 'ringing',
        isMuted: false,
        isVideoOff: !isVideo,
        isSpeakerOn: isVideo,
        durationSec: 0,
      });
    };

    const handleAccept = async () => {
      setCallState((prev) => (prev ? { ...prev, status: 'active' } : null));
      const cur = callStateRef.current;
      // Re-send offer if peer connection already exists and localDescription wasn't created yet
      if (pcRef.current && cur?.peerUserId && !pcRef.current.localDescription) {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit('call:offer', { callId: cur.callId, toUserId: cur.peerUserId, sdp: offer });
      }
      attachStreamsToVideos();
    };

    const handleReject = () => {
      cleanupPeer();
      setCallState(null);
      onCallEnded?.();
    };

    const handleEnd = () => {
      cleanupPeer();
      setCallState(null);
      onCallEnded?.();
    };

    const handleOffer = async (payload: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const cur = callStateRef.current;
      if (cur && cur.direction === 'incoming' && cur.status === 'ringing') {
        pendingOfferRef.current = payload;
        return;
      }
      await processOffer(payload);
    };

    const handleAnswer = async (payload: { sdp: RTCSessionDescriptionInit }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushPendingIce(pcRef.current);
        setCallState((prev) => (prev ? { ...prev, status: 'active' } : null));
        attachStreamsToVideos();
      }
    };

    const handleIce = async (payload: { candidate: RTCIceCandidateInit }) => {
      if (!payload.candidate) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      } else {
        pendingIceCandidatesRef.current.push(payload.candidate);
      }
    };

    socket.on('call:incoming', handleIncoming);
    socket.on('call:accept', handleAccept);
    socket.on('call:reject', handleReject);
    socket.on('call:end', handleEnd);
    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice_candidate', handleIce);

    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:accept', handleAccept);
      socket.off('call:reject', handleReject);
      socket.off('call:end', handleEnd);
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice_candidate', handleIce);
    };
  }, [currentUserId, attachStreamsToVideos, cleanupPeer, flushPendingIce, onCallEnded, processOffer]);

  return {
    callState,
    streamVersion,
    localVideoElRef,
    remoteVideoElRef,
    attachStreamsToVideos,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    hangupCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  };
}
