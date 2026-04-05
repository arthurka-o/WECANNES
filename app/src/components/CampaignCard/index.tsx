'use client';

import { Chip } from '@worldcoin/mini-apps-ui-kit-react';
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
  onClick,
  children,
}: {
  title: string;
  category: string;
  location: string;
  coverImage?: string | null;
  onClick: () => void;
  children?: ReactNode;
}) {
  const gradient = CATEGORY_GRADIENTS[category] ?? 'from-gray-400 to-gray-500';

  return (
    <button onClick={onClick} className="text-left bg-white border rounded-xl overflow-hidden w-full flex-shrink-0">
      {/* Image / gradient header */}
      <div className="relative h-40 w-full">
        {coverImage ? (
          <img src={coverImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute bottom-2 left-2">
          <Chip label={category} />
        </div>
      </div>
      {/* Content */}
      <div className="p-4 space-y-2">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-gray-500">{location}</p>
        {children}
      </div>
    </button>
  );
}
