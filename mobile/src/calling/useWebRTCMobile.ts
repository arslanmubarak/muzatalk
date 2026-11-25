import { useCallback, useEffect, useRef } from 'react';
import { mediaDevices, MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { mobileApi } from '../services/api';
import { getMobileSocket } from '../services/socket';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import type { CallType } from '../types';

export function useWebRTCMobile() {
  const { currentUser, activeCall, setActiveCall, setCallsHistory } = useMuzTalkStore();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;
    const timer = setInterval(() => {
      setActiveCall((prev) => (prev ? { ...prev, durationSec: prev.durationSec + 1 } : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall?.status, setActiveCall]);

  const cleanup = useCallback(() => {
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
  }, []);

  const setupPeerConnection = useCallback(
    async (callId: string, peerUserId: string | null, isVideo: boolean) => {
      const cfg = await mobileApi.getIceConfig().catch(() => ({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      }));

      const pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
      pcRef.current = pc;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: 'user', width: 720, height: 1280, frameRate: 30 } : false,
      });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      setActiveCall((prev) => (prev ? { ...prev, localStreamUrl: stream.toURL() } : null));

      const pcEvents = pc as unknown as {
        ontrack: ((e: { streams: MediaStream[] }) => void) | null;
        onicecandidate: ((e: { candidate: unknown }) => void) | null;
      };

      pcEvents.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote) {
          remoteStreamRef.current = remote;
          setActiveCall((prev) => (prev ? { ...prev, remoteStreamUrl: remote.toURL(), status: 'active' } : null));
        }
      };

      pcEvents.onicecandidate = (event) => {
        if (event.candidate && peerUserId) {
          getMobileSocket()?.emit('call:ice_candidate', {
            callId,
            toUserId: peerUserId,
            candidate: event.candidate,
          });
        }
      };

      return pc;
    },
    [setActiveCall]
  );

  const startCall = useCallback(
    async (params: {
      peerUserId: string | null;
      peerName: string;
      peerAvatar: string | null;
      conversationId: string | null;
      type: CallType;
    }) => {
      const { call } = await mobileApi.startCall({
        peerId: params.peerUserId,
        conversationId: params.conversationId,
        type: params.type,
      });
      const isVideo = params.type === 'VIDEO' || params.type === 'GROUP_VIDEO';
      setActiveCall({
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
        localStreamUrl: null,
        remoteStreamUrl: null,
      });

      const pc = await setupPeerConnection(call.id, params.peerUserId, isVideo);
      if (params.peerUserId) {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        getMobileSocket()?.emit('call:offer', {
          callId: call.id,
          toUserId: params.peerUserId,
          sdp: offer,
        });
      } else {
        setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : null));
      }
    },
    [setActiveCall, setupPeerConnection]
  );

  const acceptCall = useCallback(async () => {
    const cur = useMuzTalkStore.getState().activeCall;
    if (!cur || !cur.peerUserId) return;
    const isVideo = cur.type === 'VIDEO' || cur.type === 'GROUP_VIDEO';
    setActiveCall((prev) => (prev ? { ...prev, status: 'connecting' } : null));
    getMobileSocket()?.emit('call:accept', { callId: cur.callId, toUserId: cur.peerUserId });
    if (!pcRef.current) {
      await setupPeerConnection(cur.callId, cur.peerUserId, isVideo);
    }
    setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : null));
  }, [setActiveCall, setupPeerConnection]);

  const rejectCall = useCallback(async () => {
    const cur = useMuzTalkStore.getState().activeCall;
    if (!cur) return;
    if (cur.peerUserId) {
      getMobileSocket()?.emit('call:reject', { callId: cur.callId, toUserId: cur.peerUserId });
    }
    await mobileApi.endCall(cur.callId).catch(() => {});
    cleanup();
    setActiveCall(null);
    mobileApi.getCallsHistory().then((r) => setCallsHistory(r.calls)).catch(() => {});
  }, [cleanup, setActiveCall, setCallsHistory]);

  const hangupCall = useCallback(async () => {
    const cur = useMuzTalkStore.getState().activeCall;
    if (!cur) return;
    getMobileSocket()?.emit('call:end', { callId: cur.callId, toUserId: cur.peerUserId || undefined });
    await mobileApi.endCall(cur.callId).catch(() => {});
    cleanup();
    setActiveCall(null);
    mobileApi.getCallsHistory().then((r) => setCallsHistory(r.calls)).catch(() => {});
  }, [cleanup, setActiveCall, setCallsHistory]);

  const toggleMute = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev) return null;
      const next = !prev.isMuted;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return { ...prev, isMuted: next };
    });
  }, [setActiveCall]);

  const toggleVideo = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev) return null;
      const nextOff = !prev.isVideoOff;
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = !nextOff;
      });
      return { ...prev, isVideoOff: nextOff };
    });
  }, [setActiveCall]);

  const switchCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      const t = track as unknown as { _switchCamera?: () => void };
      t._switchCamera?.();
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, isSpeakerOn: !prev.isSpeakerOn } : null));
  }, [setActiveCall]);

  useEffect(() => {
    if (!currentUser) return;
    const socket = getMobileSocket();
    if (!socket) return;

    const onIncoming = (payload: {
      callId: string;
      fromUserId: string;
      fromName: string;
      fromAvatar: string | null;
      type: CallType;
    }) => {
      if (useMuzTalkStore.getState().activeCall) return;
      const isVideo = payload.type === 'VIDEO' || payload.type === 'GROUP_VIDEO';
      setActiveCall({
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
        localStreamUrl: null,
        remoteStreamUrl: null,
      });
    };

    const onAccept = () => {
      setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : null));
    };

    const onEnded = () => {
      cleanup();
      setActiveCall(null);
      mobileApi.getCallsHistory().then((r) => setCallsHistory(r.calls)).catch(() => {});
    };

    const onOffer = async (payload: { callId: string; fromUserId: string; sdp: { type: string; sdp: string } }) => {
      const cur = useMuzTalkStore.getState().activeCall;
      const isVideo = cur ? cur.type === 'VIDEO' || cur.type === 'GROUP_VIDEO' : true;
      const pc = pcRef.current || (await setupPeerConnection(payload.callId, payload.fromUserId, isVideo));
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { callId: payload.callId, toUserId: payload.fromUserId, sdp: answer });
    };

    const onAnswer = async (payload: { sdp: { type: string; sdp: string } }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : null));
      }
    };

    const onIce = async (payload: { candidate: Record<string, unknown> }) => {
      if (pcRef.current && payload.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accept', onAccept);
    socket.on('call:reject', onEnded);
    socket.on('call:end', onEnded);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice_candidate', onIce);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accept', onAccept);
      socket.off('call:reject', onEnded);
      socket.off('call:end', onEnded);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice_candidate', onIce);
    };
  }, [currentUser, cleanup, setActiveCall, setCallsHistory, setupPeerConnection]);

  return {
    activeCall,
    startCall,
    acceptCall,
    rejectCall,
    hangupCall,
    toggleMute,
    toggleVideo,
    switchCamera,
    toggleSpeaker,
  };
}
