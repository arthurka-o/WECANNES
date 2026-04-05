'use client';

import type { ReactNode } from 'react';

const CATEGORY_GRADIENTS: Record<string, string> = {
  Environment: 'from-emerald-400 to-teal-500',
  Education: 'from-blue-400 to-indigo-500',
  Social: 'from-amber-400 to-orange-500',
  Health: 'from-rose-400 to-pink-500',
  Culture: 'from-purple-400 to-violet-500',
};

export function CampaignCard({
  title,
  category,
  location,
  coverImage,
  ngo,
  sponsor,
  onClick,
  children,
}: {
  title: string;
  category: string;
  location?: string;
  coverImage?: string | null;
  ngo?: string;
  sponsor?: string | null;
  onClick: () => void;
  children?: ReactNode;
}) {
  const gradient = CATEGORY_GRADIENTS[category] ?? 'from-gray-400 to-gray-500';

  return (
    <button onClick={onClick} className="text-left bg-surface-container-lowest rounded-[24px] overflow-hidden w-full flex-shrink-0 border border-outline-variant/10 shadow-sm">
      {/* Image header */}
      <div className="relative h-48 w-full">
        {coverImage ? (
          <img src={coverImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute top-3 left-3">
          <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-primary text-[10px] font-bold uppercase tracking-wider rounded-full">
            {category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-headline text-lg font-bold text-on-surface leading-tight mb-1.5">{title}</h3>

        {(ngo || location) && (
          <div className="flex items-center gap-2 mb-3">
            {ngo && <span className="text-on-surface-variant text-xs font-medium">{ngo}</span>}
            {ngo && location && <span className="w-1 h-1 rounded-full bg-outline-variant" />}
            {location && <span className="text-on-surface-variant text-xs font-medium">{location}</span>}
          </div>
        )}

        {sponsor && (
          <div className="flex items-center gap-3 py-3 border-t border-surface-container-high">
            <div className="flex flex-col">
              <span className="text-[9px] text-on-surface-variant font-bold uppercase tracking-widest leading-none">Sponsored by</span>
              <span className="text-xs font-semibold text-on-surface">{sponsor}</span>
            </div>
          </div>
        )}

        {children && (
          <div className={sponsor ? 'mt-3' : 'mt-1'}>
            {children}
          </div>
        )}
      </div>
    </button>
  );
}
