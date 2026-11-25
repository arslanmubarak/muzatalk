import React, { useState } from 'react';

export function MuzTalkLogo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <img
        src="/src/assets/images/muztalk_brand_mark_1795586769906.jpg"
        alt="MuzTalk"
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className="rounded-xl object-cover shrink-0 shadow-sm"
      />
      <span className="font-display text-lg font-bold tracking-tight text-[#101C35] dark:text-white whitespace-nowrap shrink-0">
        MuzTalk
      </span>
    </div>
  );
}

export function UserAvatar({
  src,
  name,
  size = 'md',
  isOnline,
}: {
  src: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 text-xs'
      : size === 'lg'
        ? 'w-12 h-12 text-base'
        : size === 'xl'
          ? 'w-20 h-20 text-xl'
          : 'w-11 h-11 text-sm';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="relative shrink-0">
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`${dims} rounded-full object-cover bg-slate-200 dark:bg-slate-800`}
        />
      ) : (
        <div
          className={`${dims} rounded-full bg-[#101C35] dark:bg-[#192A4D] text-[#48D6B8] font-display font-semibold flex items-center justify-center select-none`}
        >
          {initials || 'MT'}
        </div>
      )}
      {isOnline && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#20BFA5] ring-2 ring-white dark:ring-[#101820]"
        />
      )}
    </div>
  );
}
