'use client';

import { Page } from '@/components/PageLayout';
import { campaigns, civicRewards, goals } from '@/lib/mock-data';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function VolunteerPage() {
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [step, setStep] = useState<'browse' | 'scan' | 'verify' | 'done'>('browse');
  const [showRewards, setShowRewards] = useState(false);

  const activeCampaigns = campaigns.filter((c) => c.status === 'Active');
  const campaign = selectedCampaign !== null ? campaigns[selectedCampaign] : null;
  const goal = campaign ? goals.find((g) => g.id === campaign.goalId) : null;

  const totalRewardsLeft = civicRewards.reduce((s, r) => s + r.remaining, 0);

  // Reward detail overlay
  if (showRewards) {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Civic Rewards"
            startAdornment={
              <button onClick={() => setShowRewards(false)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">Available to all volunteers — first come, first serve</p>
          {civicRewards.map((r) => (
            <div key={r.name} className="bg-white border rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-gray-500">First come, first serve</p>
              </div>
              <div className="text-right">
                {r.remaining > 0 ? (
                  <>
                    <p className="text-lg font-bold">{r.remaining}</p>
                    <p className="text-xs text-gray-400">of {r.total} left</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-red-500">Sold out</p>
                )}
              </div>
            </div>
          ))}
        </Page.Main>
      </>
    );
  }

  // Campaign detail + check-in flow
  if (campaign && goal) {
    const spotsLeft = campaign.maxVolunteers - campaign.volunteerCount;

    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={campaign.title}
            startAdornment={
              <button onClick={() => { setSelectedCampaign(null); setStep('browse'); }}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Chip label={goal.category} />
            {spotsLeft <= 5 && spotsLeft > 0 && (
              <Chip label={`${spotsLeft} spots left`} />
            )}
          </div>
          <p className="text-sm text-gray-600">{campaign.location}</p>
          <p>{campaign.description}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm">
              <span className="font-semibold">Organizer:</span> {campaign.ngo}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Volunteers:</span>{' '}
              {campaign.volunteerCount}/{campaign.maxVolunteers}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Deadline:</span> {campaign.deadline}
            </p>
          </div>

          {/* Check-in flow */}
          {step === 'browse' && (
            <Button
              size="lg"
              variant="primary"
              className="w-full"
              onClick={() => setStep('scan')}
            >
              Check In
            </Button>
          )}

          {step === 'scan' && (
            <div className="space-y-3">
              <div className="bg-gray-100 rounded-xl p-8 flex flex-col items-center justify-center gap-2">
                <div className="w-48 h-48 border-2 border-dashed border-gray-400 rounded-lg flex items-center justify-center">
                  <p className="text-gray-400 text-sm">Camera viewfinder</p>
                </div>
                <p className="text-sm text-gray-600">Scan the QR code from the NGO coordinator</p>
              </div>
              <Button
                size="lg"
                variant="primary"
                className="w-full"
                onClick={() => setStep('verify')}
              >
                Mock: QR Scanned
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-800">QR verified! Now confirm your identity.</p>
              </div>
              <Button
                size="lg"
                variant="primary"
                className="w-full"
                onClick={() => setStep('done')}
              >
                Verify with World ID
              </Button>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-green-800">Checked in!</p>
              <p className="text-sm text-green-600 mt-1">
                You'll receive civic rewards when the campaign completes.
              </p>
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
          title="Campaigns"
          startAdornment={
            <button onClick={() => router.push('/home')}>← Back</button>
          }
          endAdornment={
            <button onClick={() => setShowRewards(true)} className="relative">
              <span className="text-xl">🎁</span>
              <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalRewardsLeft}
              </span>
            </button>
          }
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        {activeCampaigns.length === 0 && (
          <p className="text-center text-gray-500 mt-8">
            No active campaigns right now.
          </p>
        )}
        {activeCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goalId);
          const spotsLeft = c.maxVolunteers - c.volunteerCount;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCampaign(c.id)}
              className="text-left bg-white border rounded-xl p-4 space-y-2"
            >
              <div className="flex justify-between items-start">
                <p className="font-semibold">{c.title}</p>
                <Chip label={g?.category ?? ''} />
              </div>
              <p className="text-sm text-gray-600">{c.location}</p>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{c.volunteerCount}/{c.maxVolunteers} volunteers</span>
                {spotsLeft <= 5 && <span className="text-amber-600">{spotsLeft} spots left</span>}
              </div>
            </button>
          );
        })}
      </Page.Main>
    </>
  );
}
