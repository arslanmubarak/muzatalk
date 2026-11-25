import React, { useEffect, useState } from 'react';
import { Eye, Send, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import type { StatusDTO } from '../../shared/types';
import { UserAvatar } from './MuzTalkLogo';

const QUICK_REACTIONS = ['💚', '🔥', '👏', '😂', '😮'];

export function StatusViewerModal({
  status,
  currentUserId,
  onClose,
  onReact,
  onDelete,
  onReplyToChat,
}: {
  status: StatusDTO;
  currentUserId: string;
  onClose: () => void;
  onReact: (statusId: string, emoji: string) => void;
  onDelete: (statusId: string) => void;
  onReplyToChat: (userId: string, text: string) => void;
}) {
  const [reply, setReply] = useState('');
  const [showViewers, setShowViewers] = useState(false);

  useEffect(() => {
    api.viewStatus(status.id).catch(() => {});
  }, [status.id]);

  const isOwner = status.userId === currentUserId;

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    onReplyToChat(status.userId, `Replied to your status: "${reply.trim()}"`);
    setReply('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md h-[84vh] rounded-3xl overflow-hidden bg-[#101820] border border-white/10 flex flex-col justify-between text-white">
        {/* Progress bar & header */}
        <div className="p-4 bg-gradient-to-b from-black/70 to-transparent z-10">
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-3">
            <div className="h-full w-full bg-[#20BFA5]" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar src={status.userAvatar} name={status.userName} size="sm" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{status.userName}</div>
                <div className="text-xs text-slate-300">
                  {new Date(status.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Expires in 24h
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => onDelete(status.id)}
                  className="p-2 rounded-full hover:bg-white/10 text-red-400"
                  aria-label="Delete status"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10"
                aria-label="Close status viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Media / Text Content */}
        <div
          className="absolute inset-0 flex items-center justify-center p-8 text-center"
          style={status.type === 'TEXT' ? { backgroundColor: status.bgColor || '#101C35' } : undefined}
        >
          {status.type === 'IMAGE' && status.mediaUrl ? (
            <img
              src={status.mediaUrl}
              alt={status.caption || status.userName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <p className="font-display text-2xl font-semibold leading-relaxed text-white">
              {status.contentText}
            </p>
          )}
        </div>

        {/* Bottom caption + reaction / reply */}
        <div className="p-4 bg-gradient-to-t from-black/85 via-black/50 to-transparent z-10 space-y-3">
          {status.caption && (
            <p className="text-sm text-center text-white/95">{status.caption}</p>
          )}

          {isOwner ? (
            <div>
              <button
                type="button"
                onClick={() => setShowViewers((v) => !v)}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center gap-2 text-xs font-medium"
              >
                <Eye className="w-4 h-4 text-[#48D6B8]" />
                <span className="tabular-nums">{status.viewsCount} views</span>
              </button>
              {showViewers && (
                <div className="mt-2 max-h-32 overflow-y-auto bg-black/70 rounded-xl p-3 space-y-1.5 text-xs">
                  {status.viewers.length === 0 ? (
                    <div className="text-slate-400">No views yet</div>
                  ) : (
                    status.viewers.map((v) => (
                      <div key={v.userId} className="flex justify-between">
                        <span>{v.displayName}</span>
                        <span className="text-slate-400 tabular-nums">
                          {new Date(v.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(status.id, emoji)}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg transition-transform active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSendReply} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Reply to ${status.userName}...`}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-full bg-white/15 text-sm text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                />
                <button
                  type="submit"
                  className="w-10 h-10 rounded-full bg-[#20BFA5] hover:bg-[#1aa891] flex items-center justify-center shrink-0"
                  aria-label="Send reply"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
