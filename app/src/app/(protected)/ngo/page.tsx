'use client';

import { Page } from '@/components/PageLayout';
import { campaigns, goals } from '@/lib/mock-data';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NgoPage() {
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const ngoCampaigns = campaigns.filter((c) => c.ngo === 'OceanCare');
  const campaign = selectedCampaign !== null ? campaigns[selectedCampaign] : null;

  // QR code display for volunteer check-in
  if (showQR && campaign) {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Check-In QR"
            startAdornment={
              <button onClick={() => setShowQR(false)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col items-center justify-center gap-4">
          <div className="w-64 h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
            <p className="text-gray-400 text-sm text-center">QR Code<br />Campaign #{campaign.id}</p>
          </div>
          <p className="text-sm text-gray-600 text-center">
            Show this to volunteers so they can scan and check in.
          </p>
          <p className="text-xs text-gray-400">
            {campaign.volunteerCount}/{campaign.maxVolunteers} checked in
          </p>
        </Page.Main>
      </>
    );
  }

  // Submit completion with photos
  if (showSubmit && campaign) {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Submit Completion"
            startAdornment={
              <button onClick={() => setShowSubmit(false)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              Upload photos from the event. The sponsor will review them before funds are released.
            </p>
          </div>

          <p className="font-semibold">Event Photos</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="aspect-square bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <p className="text-gray-400 text-xs text-center">+ Add photo</p>
            </div>
            <div className="aspect-square bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <p className="text-gray-400 text-xs text-center">+ Add photo</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-1">
            <p className="text-sm"><span className="font-semibold">Verified check-ins:</span> {campaign.volunteerCount}</p>
            <p className="text-sm"><span className="font-semibold">Min required:</span> {campaign.minVolunteers}</p>
            <p className="text-sm"><span className="font-semibold">Funding:</span> {campaign.fundingRequired} USDC</p>
          </div>

          <Button size="lg" variant="primary" className="w-full">
            Submit for Review
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Sponsor has 7 days to review. Funds auto-release after that.
          </p>
        </Page.Main>
      </>
    );
  }

  // Campaign detail
  if (campaign) {
    const goal = goals.find((g) => g.id === campaign.goalId);
    const canComplete = campaign.status === 'Active' && campaign.volunteerCount >= campaign.minVolunteers;

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
        <Page.Main className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Chip label={campaign.status} />
            <Chip label={goal?.category ?? ''} />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm"><span className="font-semibold">Location:</span> {campaign.location}</p>
            <p className="text-sm"><span className="font-semibold">Sponsor:</span> {campaign.sponsor ?? 'Awaiting sponsor'}</p>
            <p className="text-sm">
              <span className="font-semibold">Volunteers:</span>{' '}
              {campaign.volunteerCount}/{campaign.maxVolunteers}
              <span className="text-gray-400"> (min {campaign.minVolunteers})</span>
            </p>
            <p className="text-sm"><span className="font-semibold">Funding:</span> {campaign.fundingRequired} USDC</p>
            <p className="text-sm"><span className="font-semibold">Deadline:</span> {campaign.deadline}</p>
          </div>

          {campaign.status === 'Active' && (
            <Button size="lg" variant="secondary" className="w-full" onClick={() => setShowQR(true)}>
              Show Check-In QR
            </Button>
          )}

          {canComplete && (
            <Button size="lg" variant="primary" className="w-full" onClick={() => setShowSubmit(true)}>
              Submit Completion
            </Button>
          )}

          {campaign.status === 'Active' && campaign.volunteerCount < campaign.minVolunteers && (
            <p className="text-xs text-amber-600 text-center">
              Need {campaign.minVolunteers - campaign.volunteerCount} more volunteers before you can submit
            </p>
          )}

          {campaign.status === 'PendingReview' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-sm text-amber-800">Waiting for sponsor to review and approve</p>
            </div>
          )}
        </Page.Main>
      </>
    );
  }

  // Campaign list
  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="OceanCare"
          startAdornment={
            <button onClick={() => router.push('/home')}>← Back</button>
          }
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <p className="font-semibold">Your Campaigns</p>
          <Button size="sm" variant="secondary">
            + New Campaign
          </Button>
        </div>

        {ngoCampaigns.map((c) => {
          const goal = goals.find((g) => g.id === c.goalId);
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCampaign(c.id)}
              className="text-left bg-white border rounded-xl p-4 space-y-2"
            >
              <div className="flex justify-between items-start">
                <p className="font-semibold">{c.title}</p>
                <Chip label={c.status} />
              </div>
              <p className="text-sm text-gray-600">{goal?.title}</p>
              <p className="text-sm">
                {c.volunteerCount}/{c.maxVolunteers} volunteers · {c.fundingRequired} USDC
              </p>
            </button>
          );
        })}
      </Page.Main>
    </>
  );
}
