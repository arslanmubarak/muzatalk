import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Move,
  Phone,
  PhoneOff,
  PictureInPicture2,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ActiveCallState } from '../hooks/useWebRTC';
import { UserAvatar } from './MuzTalkLogo';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CallOverlay({
  callState,
  streamVersion,
  localVideoRef,
  remoteVideoRef,
  onAttachStreams,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
}: {
  callState: ActiveCallState;
  streamVersion: number;
  localVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onAttachStreams: () => void;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
}) {
  const [isFloating, setIsFloating] = useState(false);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 320) : 24,
    y: 76,
  }));
  const dragOriginRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);

  const isVideo = callState.type === 'VIDEO' || callState.type === 'GROUP_VIDEO';
  const isGroup = callState.type === 'GROUP_AUDIO' || callState.type === 'GROUP_VIDEO';

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      onAttachStreams();
    });
    return () => window.cancelAnimationFrame(id);
  }, [callState.status, callState.isVideoOff, isFloating, streamVersion, onAttachStreams]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: floatPos.x,
      startY: floatPos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = e.clientX - origin.pointerX;
    const dy = e.clientY - origin.pointerY;
    const maxX = Math.max(16, window.innerWidth - 300);
    const maxY = Math.max(16, window.innerHeight - 240);
    setFloatPos({
      x: Math.min(maxX, Math.max(8, origin.startX + dx)),
      y: Math.min(maxY, Math.max(8, origin.startY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragOriginRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleBrowserPiP = async () => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      // ignore if browser disallows PiP before stream metadata loads
    }
  };

  if (isFloating) {
    return (
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: `translate3d(${floatPos.x}px, ${floatPos.y}px, 0)` }}
        className="fixed top-0 left-0 z-50 w-72 sm:w-80 rounded-2xl bg-[#101C35] text-white border border-white/20 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <div className="px-3 py-2 bg-black/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Move className="w-3.5 h-3.5 text-[#48D6B8] shrink-0" />
            <span className="text-xs font-semibold truncate">{callState.peerName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-[11px] tabular-nums text-[#48D6B8]">
              {callState.status === 'active' ? formatDuration(callState.durationSec) : callState.status}
            </span>
            {isVideo && typeof document !== 'undefined' && document.pictureInPictureEnabled && (
              <button
                type="button"
                onClick={handleBrowserPiP}
                className="p-1 rounded-md hover:bg-white/15"
                title="Browser Picture-in-Picture"
                aria-label="Browser Picture-in-Picture"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFloating(false)}
              className="p-1 rounded-md hover:bg-white/15"
              title="Expand call window"
              aria-label="Expand call window"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative h-44 bg-[#0B1220] flex items-center justify-center">
          {isVideo ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="absolute bottom-2 right-2 w-16 aspect-[3/4] rounded-lg object-cover border border-white/25 bg-slate-900 shadow-md"
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UserAvatar src={callState.peerAvatar} name={callState.peerName} size="lg" />
              <span className="text-xs text-slate-300">Voice Call Active</span>
            </div>
          )}
        </div>

        <div className="px-3 py-2.5 bg-[#101820] flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onToggleMute}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              callState.isMuted ? 'bg-white text-[#101C35]' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            aria-label={callState.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {callState.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={onToggleVideo}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                callState.isVideoOff ? 'bg-white text-[#101C35]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              aria-label={callState.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {callState.isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onHangup}
            className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
            aria-label="End call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#101C35]/95 backdrop-blur-md flex flex-col items-center justify-between p-6 text-white">
      {/* Top call status */}
      <div className="w-full max-w-3xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!(callState.direction === 'incoming' && callState.status === 'ringing') && (
            <button
              type="button"
              onClick={() => setIsFloating(true)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Float mini call screen"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Float</span>
            </button>
          )}
          <div className="text-xs font-medium text-slate-300">
            MuzTalk E2EE {isGroup ? 'SFU Group Call' : isVideo ? 'Video Call' : 'Voice Call'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isVideo && callState.status === 'active' && typeof document !== 'undefined' && document.pictureInPictureEnabled && (
            <button
              type="button"
              onClick={handleBrowserPiP}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-1.5"
              title="System Picture-in-Picture"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PiP</span>
            </button>
          )}
          <div className="font-mono text-sm tabular-nums text-[#48D6B8]">
            {callState.status === 'active'
              ? formatDuration(callState.durationSec)
              : callState.status === 'ringing'
                ? callState.direction === 'incoming'
                  ? 'Incoming...'
                  : 'Ringing...'
                : 'Connecting...'}
          </div>
        </div>
      </div>

      {/* Center video / avatar stage */}
      <div className="relative w-full max-w-3xl flex-1 my-6 rounded-3xl bg-[#101820] border border-white/10 overflow-hidden flex items-center justify-center">
        {isVideo && callState.status !== 'ended' ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${callState.status === 'active' ? 'opacity-100' : 'opacity-40'}`}
            />
            {callState.status !== 'active' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-[#101820]/60">
                <div className="mb-4">
                  <UserAvatar src={callState.peerAvatar} name={callState.peerName} size="xl" />
                </div>
                <h2 className="font-display text-2xl font-bold">{callState.peerName}</h2>
                <p className="text-sm text-slate-300 mt-1">
                  {callState.direction === 'incoming' && callState.status === 'ringing'
                    ? 'Incoming video call'
                    : 'Connecting video stream...'}
                </p>
              </div>
            )}
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-[3/4] rounded-2xl object-cover border border-white/20 bg-slate-900 shadow-lg"
            />
          </>
        ) : (
          <div className="flex flex-col items-center text-center px-6">
            {isGroup ? (
              <div className="w-24 h-24 rounded-full bg-[#20BFA5]/20 border border-[#20BFA5]/40 flex items-center justify-center mb-4">
                <Users className="w-10 h-10 text-[#48D6B8]" />
              </div>
            ) : (
              <div className="mb-4">
                <UserAvatar src={callState.peerAvatar} name={callState.peerName} size="xl" />
              </div>
            )}
            <h2 className="font-display text-2xl font-bold">{callState.peerName}</h2>
            <p className="text-sm text-slate-300 mt-1">
              {callState.direction === 'incoming' && callState.status === 'ringing'
                ? `Incoming ${isVideo ? 'video' : 'audio'} call`
                : isGroup
                  ? 'LiveKit SFU Group Conference Room Active'
                  : 'WebRTC Peer-to-Peer Channel'}
            </p>
            {callState.error && (
              <p className="mt-3 text-xs text-amber-300 max-w-md">{callState.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom call controls */}
      <div className="flex items-center gap-4">
        {callState.direction === 'incoming' && callState.status === 'ringing' ? (
          <>
            <button
              type="button"
              onClick={onReject}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
              aria-label="Decline call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="w-14 h-14 rounded-full bg-[#20BFA5] hover:bg-[#1aa891] flex items-center justify-center transition-colors"
              aria-label="Accept call"
            >
              <Phone className="w-6 h-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                callState.isMuted ? 'bg-white text-[#101C35]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              aria-label={callState.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {callState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {isVideo && (
              <button
                type="button"
                onClick={onToggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  callState.isVideoOff ? 'bg-white text-[#101C35]' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                aria-label={callState.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {callState.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleSpeaker}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                callState.isSpeakerOn ? 'bg-white text-[#101C35]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              aria-label="Toggle speaker"
            >
              {callState.isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
              aria-label="End call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
