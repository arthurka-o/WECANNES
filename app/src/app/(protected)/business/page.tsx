'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { Page } from '@/components/PageLayout';
import type { Campaign, Goal } from '@/lib/db';
import { MiniKit } from '@worldcoin/minikit-js';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Settings } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPublicClient, encodeFunctionData, http, parseUnits } from 'viem';
import { worldchain } from 'viem/chains';

const EURC_ADDRESS = '0x1C60ba0A0eD1019e8Eb035E6daF4155A5cE2380B';
const EURC_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

const client = createPublicClient({
  chain: worldchain,
  transport: http('https://worldchain-mainnet.g.alchemy.com/public'),
});

export default function BusinessPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [businessName, setBusinessName] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [tab, setTab] = useState<'browse' | 'review' | 'sponsored'>('browse');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [refreshKey]);

  useEffect(() => {
    const wallet = session?.user?.walletAddress;
    if (wallet) {
      fetch(`/api/user-role?wallet=${wallet}`)
        .then((r) => r.json())
        .then((data) => { if (data.name) setBusinessName(data.name); });
    }
  }, [session]);

  useEffect(() => {
    if (selectedCampaign !== null) {
      fetch(`/api/campaigns/photos?campaignId=${selectedCampaign}`)
        .then((r) => r.json())
        .then(setPhotos);
    } else {
      setPhotos([]);
    }
  }, [selectedCampaign]);

  const { poll } = useUserOperationReceipt({ client });

  const openCampaigns = campaigns.filter((c) => c.status === 'Open');
  const isMySponsor = (s: string | null) => s === businessName || (!businessName && s === "Pierre's Restaurant");
  const pendingReview = campaigns.filter((c) => c.status === 'PendingReview' && isMySponsor(c.sponsor));
  const sponsored = campaigns.filter((c) => isMySponsor(c.sponsor) && c.status !== 'Open');
  const campaign = selectedCampaign !== null ? campaigns.find((c) => c.id === selectedCampaign) : null;

  const handleFund = async (campaignId: number) => {
    const c = campaigns.find((c) => c.id === campaignId);
    if (!c) return;

    const amount = parseUnits(String(c.funding_required), 6); // EURC has 6 decimals
    const result = await MiniKit.sendTransaction({
      chainId: 480,
      transactions: [
        {
          to: EURC_ADDRESS,
          data: encodeFunctionData({
            abi: EURC_ABI,
            functionName: 'approve',
            args: [CAMPAIGN_ESCROW_ADDRESS, amount],
          }),
        },
        {
          to: CAMPAIGN_ESCROW_ADDRESS,
          data: encodeFunctionData({
            abi: CAMPAIGN_ESCROW_ABI,
            functionName: 'fundCampaign',
            args: [BigInt(campaignId)],
          }),
        },
      ],
    });
    await poll(result.data.userOpHash);

    await fetch('/api/campaigns/fund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, sponsor: businessName }),
    });
    setSelectedCampaign(null);
    setRefreshKey((k) => k + 1);
  };

  const handleApprove = async (campaignId: number) => {
    const result = await MiniKit.sendTransaction({
      chainId: 480,
      transactions: [
        {
          to: CAMPAIGN_ESCROW_ADDRESS,
          data: encodeFunctionData({
            abi: CAMPAIGN_ESCROW_ABI,
            functionName: 'approveRelease',
            args: [BigInt(campaignId)],
          }),
        },
      ],
    });
    await poll(result.data.userOpHash);

    await fetch('/api/campaigns/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    });
    setSelectedCampaign(null);
    setRefreshKey((k) => k + 1);
  };

  const handleReject = async (campaignId: number) => {
    const result = await MiniKit.sendTransaction({
      chainId: 480,
      transactions: [
        {
          to: CAMPAIGN_ESCROW_ADDRESS,
          data: encodeFunctionData({
            abi: CAMPAIGN_ESCROW_ABI,
            functionName: 'rejectCompletion',
            args: [BigInt(campaignId)],
          }),
        },
      ],
    });
    await poll(result.data.userOpHash);

    await fetch('/api/campaigns/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    });
    setSelectedCampaign(null);
    setRefreshKey((k) => k + 1);
  };

  // Campaign detail — Open (sponsor it)
  if (campaign && campaign.status === 'Open') {
    const goal = goals.find((g) => g.id === campaign.goal_id);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={campaign.title}
            startAdornment={<button onClick={() => setSelectedCampaign(null)}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <Chip label={goal?.category ?? ''} />
          <p className="text-sm text-gray-600">{campaign.location}</p>
          <p>{campaign.description}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm"><span className="font-semibold">Organizer:</span> {campaign.ngo}</p>
            <p className="text-sm"><span className="font-semibold">Volunteers:</span> {campaign.min_volunteers}–{campaign.max_volunteers}</p>
            <p className="text-sm"><span className="font-semibold">Funding:</span> {campaign.funding_required} EURC</p>
            <p className="text-sm"><span className="font-semibold">Event:</span> {campaign.event_date}</p>
            <p className="text-sm"><span className="font-semibold">Find sponsor by:</span> {campaign.sponsorship_deadline}</p>
          </div>

          <Button size="lg" variant="primary" className="w-full" onClick={() => handleFund(campaign.id)}>
            Sponsor — {campaign.funding_required} EURC
          </Button>
        </Page.Main>
      </>
    );
  }

  // Campaign detail — PendingReview (approve/reject)
  if (campaign && campaign.status === 'PendingReview') {
    const goal = goals.find((g) => g.id === campaign.goal_id);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Review Completion"
            startAdornment={<button onClick={() => setSelectedCampaign(null)}>← Back</button>}
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
            <p className="text-sm"><span className="font-semibold">Verified check-ins:</span> {campaign.volunteer_count}</p>
            <p className="text-sm"><span className="font-semibold">Required:</span> {campaign.min_volunteers}–{campaign.max_volunteers}</p>
            <p className="text-sm"><span className="font-semibold">Your sponsorship:</span> {campaign.funding_required} EURC</p>
          </div>

          <p className="font-semibold">Event Photos</p>
          <div className="grid grid-cols-2 gap-2">
            {photos.length > 0 ? (
              photos.map((p, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 col-span-2">No photos uploaded</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold">NGO Contact</p>
            <p className="text-sm">{campaign.ngo}</p>
            {campaign.ngo_contact && <p className="text-sm">{campaign.ngo_contact}</p>}
            <p className="text-xs text-gray-400">
              Contact the NGO if photos need to be resubmitted
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              By approving, {campaign.funding_required} EURC will be released to {campaign.ngo}. You can use these photos for marketing and ESG reporting.
            </p>
          </div>

          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => handleReject(campaign.id)}>
              Reject
            </Button>
            <Button size="lg" variant="primary" className="flex-1" onClick={() => handleApprove(campaign.id)}>
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

  // Campaign detail — any other status (view only)
  if (campaign) {
    const goal = goals.find((g) => g.id === campaign.goal_id);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={campaign.title}
            startAdornment={<button onClick={() => setSelectedCampaign(null)}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Chip label={campaign.status} />
            <Chip label={goal?.category ?? ''} />
          </div>
          <p className="text-sm text-gray-600">{campaign.location}</p>
          <p>{campaign.description}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-sm"><span className="font-semibold">Organizer:</span> {campaign.ngo}</p>
            <p className="text-sm"><span className="font-semibold">Volunteers:</span> {campaign.volunteer_count}/{campaign.max_volunteers}</p>
            <p className="text-sm"><span className="font-semibold">Your sponsorship:</span> {campaign.funding_required} EURC</p>
          </div>

          {campaign.status === 'Completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-green-800">{campaign.funding_required} EURC released</p>
              <p className="text-sm text-green-600 mt-1">Campaign completed successfully</p>
            </div>
          )}

          {campaign.status === 'Expired' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-red-800">Campaign expired</p>
              <p className="text-sm text-red-600 mt-1">Funds refunded to your wallet</p>
            </div>
          )}

          {photos.length > 0 && (
            <>
              <p className="font-semibold">Event Photos</p>
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </>
          )}
        </Page.Main>
      </>
    );
  }

  // List view with tabs
  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title={businessName || 'Business'}
          endAdornment={<button onClick={() => router.push('/debug')}><Settings /></button>}
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
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
          <button
            onClick={() => setTab('sponsored')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg ${tab === 'sponsored' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            My ({sponsored.length})
          </button>
        </div>

        {tab === 'browse' && (
          <>
            <p className="text-sm text-gray-500">Campaigns looking for sponsors</p>
            {openCampaigns.length === 0 && <p className="text-center text-gray-400 mt-4">No campaigns need sponsoring</p>}
            {openCampaigns.map((c) => {
              const goal = goals.find((g) => g.id === c.goal_id);
              return (
                <button key={c.id} onClick={() => setSelectedCampaign(c.id)} className="text-left bg-white border rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={goal?.category ?? ''} />
                  </div>
                  <p className="text-sm text-gray-600">{c.ngo} · {c.location}</p>
                  <p className="text-sm font-semibold">{c.funding_required} EURC</p>
                </button>
              );
            })}
          </>
        )}

        {tab === 'review' && (
          <>
            <p className="text-sm text-gray-500">Campaigns awaiting your approval</p>
            {pendingReview.length === 0 && <p className="text-center text-gray-400 mt-4">Nothing to review</p>}
            {pendingReview.map((c) => {
              const goal = goals.find((g) => g.id === c.goal_id);
              return (
                <button key={c.id} onClick={() => setSelectedCampaign(c.id)} className="text-left bg-white border rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={goal?.category ?? ''} />
                  </div>
                  <p className="text-sm text-gray-600">{c.ngo} · {c.volunteer_count} verified volunteers</p>
                  <p className="text-sm font-semibold">{c.funding_required} EURC to release</p>
                </button>
              );
            })}
          </>
        )}

        {tab === 'sponsored' && (
          <>
            <p className="text-sm text-gray-500">Campaigns you sponsored</p>
            {sponsored.length === 0 && <p className="text-center text-gray-400 mt-4">No sponsored campaigns yet</p>}
            {sponsored.map((c) => {
              const goal = goals.find((g) => g.id === c.goal_id);
              return (
                <button key={c.id} onClick={() => setSelectedCampaign(c.id)} className="text-left bg-white border rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={c.status} />
                  </div>
                  <p className="text-sm text-gray-600">{c.ngo} · {c.location}</p>
                  <p className="text-sm font-semibold">{c.funding_required} EURC</p>
                </button>
              );
            })}
          </>
        )}
      </Page.Main>
    </>
  );
}
