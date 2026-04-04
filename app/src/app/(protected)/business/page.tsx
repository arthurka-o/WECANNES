'use client';

import { Page } from '@/components/PageLayout';
import { campaigns, goals, ngoDirectory } from '@/lib/mock-data';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function BusinessPage() {
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [tab, setTab] = useState<'browse' | 'review'>('browse');

  const openCampaigns = campaigns.filter((c) => c.status === 'Open');
  const pendingReview = campaigns.filter(
    (c) => c.status === 'PendingReview' && c.sponsor === 'Librairie Cannes'
  );
  const campaign = selectedCampaign !== null ? campaigns[selectedCampaign] : null;

  // Campaign detail (for sponsoring)
  if (campaign && campaign.status === 'Open') {
    const goal = goals.find((g) => g.id === campaign.goalId);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={campaign.title}
            startAdornment={
              <button onClick={() => setSelectedCampaign(null)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <Chip label={goal?.category ?? ''} />
          <p className="text-sm text-gray-600">{campaign.location}</p>
          <p>{campaign.description}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm"><span className="font-semibold">Organizer:</span> {campaign.ngo}</p>
            <p className="text-sm"><span className="font-semibold">Volunteers:</span> {campaign.minVolunteers}–{campaign.maxVolunteers}</p>
            <p className="text-sm"><span className="font-semibold">Funding:</span> {campaign.fundingRequired} USDC</p>
            <p className="text-sm"><span className="font-semibold">Deadline:</span> {campaign.deadline}</p>
          </div>

          <Button size="lg" variant="primary" className="w-full">
            Sponsor — {campaign.fundingRequired} USDC
          </Button>
        </Page.Main>
      </>
    );
  }

  // Review detail (for approving completion)
  if (campaign && campaign.status === 'PendingReview') {
    const goal = goals.find((g) => g.id === campaign.goalId);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Review Completion"
            startAdornment={
              <button onClick={() => setSelectedCampaign(null)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Chip label={goal?.category ?? ''} />
            <Chip label="Pending Review" />
          </div>
          <p className="font-semibold">{campaign.title}</p>
          <p className="text-sm text-gray-600">{campaign.ngo} · {campaign.location}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm"><span className="font-semibold">Verified check-ins:</span> {campaign.volunteerCount}</p>
            <p className="text-sm"><span className="font-semibold">Required range:</span> {campaign.minVolunteers}–{campaign.maxVolunteers}</p>
            <p className="text-sm"><span className="font-semibold">Your sponsorship:</span> {campaign.fundingRequired} USDC</p>
          </div>

          {/* Photos from NGO */}
          <p className="font-semibold">Event Photos</p>
          <div className="grid grid-cols-2 gap-2">
            {campaign.photos.length > 0 ? (
              campaign.photos.map((_, i) => (
                <div key={i} className="aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
                  <p className="text-gray-400 text-xs">Photo {i + 1}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 col-span-2">No photos uploaded</p>
            )}
          </div>

          {/* NGO contact info */}
          {(() => {
            const ngo = ngoDirectory[campaign.ngo];
            return ngo ? (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold">NGO Contact</p>
                <p className="text-sm">{ngo.contactEmail}</p>
                <p className="text-sm">{ngo.contactPhone}</p>
                <p className="text-xs text-gray-400">
                  Contact the NGO if photos need to be resubmitted
                </p>
              </div>
            ) : null;
          })()}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              By approving, {campaign.fundingRequired} USDC will be released to {campaign.ngo}. You can use these photos for marketing and ESG reporting.
            </p>
          </div>

          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="flex-1">
              Reject
            </Button>
            <Button size="lg" variant="primary" className="flex-1">
              Approve & Release
            </Button>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Auto-releases in 7 days if no action taken.
          </p>
        </Page.Main>
      </>
    );
  }

  // List view with tabs
  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="Business"
          startAdornment={
            <button onClick={() => router.push('/home')}>← Back</button>
          }
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        {/* Tab switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('browse')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg ${tab === 'browse' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Sponsor ({openCampaigns.length})
          </button>
          <button
            onClick={() => setTab('review')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg ${tab === 'review' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Review ({pendingReview.length})
          </button>
        </div>

        {tab === 'browse' && (
          <>
            <p className="text-sm text-gray-500">Campaigns looking for sponsors</p>
            {openCampaigns.map((c) => {
              const goal = goals.find((g) => g.id === c.goalId);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c.id)}
                  className="text-left bg-white border rounded-xl p-4 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={goal?.category ?? ''} />
                  </div>
                  <p className="text-sm text-gray-600">{c.ngo} · {c.location}</p>
                  <p className="text-sm font-semibold">{c.fundingRequired} USDC</p>
                </button>
              );
            })}
          </>
        )}

        {tab === 'review' && (
          <>
            <p className="text-sm text-gray-500">Campaigns awaiting your approval</p>
            {pendingReview.length === 0 && (
              <p className="text-center text-gray-400 mt-4">Nothing to review</p>
            )}
            {pendingReview.map((c) => {
              const goal = goals.find((g) => g.id === c.goalId);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c.id)}
                  className="text-left bg-white border rounded-xl p-4 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={goal?.category ?? ''} />
                  </div>
                  <p className="text-sm text-gray-600">{c.ngo} · {c.volunteerCount} verified volunteers</p>
                  <p className="text-sm font-semibold">{c.fundingRequired} USDC to release</p>
                </button>
              );
            })}
          </>
        )}
      </Page.Main>
    </>
  );
}
