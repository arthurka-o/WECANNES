'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { CampaignCard } from '@/components/CampaignCard';
import { Page } from '@/components/PageLayout';
import { formatDate } from '@/lib/utils';
import type { Campaign, Goal } from '@/lib/db';
import { MiniKit } from '@worldcoin/minikit-js';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose, Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
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
  const [confirmAction, setConfirmAction] = useState<{ type: 'fund' | 'approve' | 'reject'; campaignId: number } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [refreshKey]);

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

  useEffect(() => {
    const wallet = session?.user?.walletAddress;
    if (wallet) {
      fetch(`/api/user-role?wallet=${wallet}`)
        .then((r) => r.json())
        .then((data) => { if (data.name) setBusinessName(data.name); });
    }
  }, [session]);

  const openCampaigns = campaigns.filter((c) => c.status === 'Open');
  const isMySponsor = (s: string | null) => s !== null && s !== '' && s === businessName;
  const pendingReview = campaigns.filter((c) => c.status === 'PendingReview' && isMySponsor(c.sponsor));
  const sponsored = campaigns.filter((c) => isMySponsor(c.sponsor) && c.status !== 'Open');
  const campaign = selectedCampaign !== null ? campaigns.find((c) => c.id === selectedCampaign) : null;

  const handleFund = async (campaignId: number) => {
    const c = campaigns.find((c) => c.id === campaignId);
    if (!c || !businessName) return;

    try {
      const amount = parseUnits(String(c.funding_required), 6);
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
    } catch (err) {
      console.error('Fund error:', err);
      alert('Transaction failed. Please try again.');
    }
  };

  const handleApprove = async (campaignId: number) => {

    try {
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
    } catch (err) {
      console.error('Approve error:', err);
      alert('Transaction failed. Please try again.');
    }
  };

  const handleReject = async (campaignId: number) => {

    try {
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
    } catch (err) {
      console.error('Reject error:', err);
      alert('Transaction failed. Please try again.');
    }
  };

  const confirmDialog = (
    <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmAction?.type === 'fund' && 'Sponsor campaign'}
            {confirmAction?.type === 'approve' && 'Release funds'}
            {confirmAction?.type === 'reject' && 'Reject submission'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction?.type === 'fund' && `Sponsor this campaign for ${campaigns.find(c => c.id === confirmAction.campaignId)?.funding_required} EURC?`}
            {confirmAction?.type === 'approve' && 'Approve and release funds to the NGO?'}
            {confirmAction?.type === 'reject' && 'Reject this submission? The NGO can resubmit.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose asChild>
            <Button variant="secondary" size="lg" className="w-full">Cancel</Button>
          </AlertDialogClose>
          <Button
            variant={confirmAction?.type === 'reject' ? 'secondary' : 'primary'}
            size="lg"
            className="w-full"
            disabled={actionPending}
            onClick={async () => {
              if (!confirmAction) return;
              setActionPending(true);
              if (confirmAction.type === 'fund') await handleFund(confirmAction.campaignId);
              if (confirmAction.type === 'approve') await handleApprove(confirmAction.campaignId);
              if (confirmAction.type === 'reject') await handleReject(confirmAction.campaignId);
              setActionPending(false);
              setConfirmAction(null);
            }}
          >
            {actionPending ? 'Processing...' : confirmAction?.type === 'fund' ? 'Sponsor' : confirmAction?.type === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Shared info rows for campaign detail
  const campaignInfoRows = (c: typeof campaign) => {
    if (!c) return null;
    const g = goals.find((g) => g.id === c.goal_id);
    const days = Math.ceil((new Date(c.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      <>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-white/90 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full border border-outline-variant/10">{g?.category}</span>
          <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
            c.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
            c.status === 'Active' ? 'bg-blue-100 text-blue-800' :
            c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
            c.status === 'PendingReview' ? 'bg-purple-100 text-purple-800' :
            c.status === 'Expired' ? 'bg-red-100 text-red-800' :
            'bg-surface-container text-on-surface-variant'
          }`}>{c.status === 'PendingReview' ? 'In Review' : c.status}</span>
        </div>

        <p className="text-sm text-on-surface-variant">{c.description}</p>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">location_on</span>
            <span className="text-on-surface">{c.location}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">event</span>
            <span className="text-on-surface">
              {formatDate(c.event_date)}
              {days < 0 && <span className="text-on-surface-variant"> · {-days}d ago</span>}
              {days === 0 && <span className="text-primary font-semibold"> · Today</span>}
              {days > 0 && <span className="text-on-surface-variant"> · in {days}d</span>}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">apartment</span>
            <span className="text-on-surface">{c.ngo}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">payments</span>
            <span className="text-on-surface">{c.funding_required} EURC</span>
          </div>
          {c.status === 'Open' && (
            <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-lg">schedule</span>
              <span>Sponsor by {formatDate(c.sponsorship_deadline)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{c.volunteer_count}/{c.min_volunteers}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">checked in</p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-tertiary">{c.interest_count}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">signed up</p>
          </div>
        </div>
      </>
    );
  };

  // Campaign detail — Open (sponsor it)
  if (campaign && campaign.status === 'Open') {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedCampaign(null)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface truncate">{campaign.title}</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          {campaignInfoRows(campaign)}

          <button
            style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
            className="shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            onClick={() => setConfirmAction({ type: 'fund', campaignId: campaign.id })}
          >
            Sponsor — {campaign.funding_required} EURC
          </button>
          {confirmDialog}
        </Page.Main>
      </>
    );
  }

  // Campaign detail — PendingReview (approve/reject)
  if (campaign && campaign.status === 'PendingReview') {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedCampaign(null)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Review Completion</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          {campaignInfoRows(campaign)}

          <p className="font-headline font-bold text-on-surface">Event Photos</p>
          <div className="grid grid-cols-2 gap-2">
            {photos.length > 0 ? (
              photos.map((p, i) => (
                <div key={i} className="aspect-square bg-surface-container rounded-[16px] overflow-hidden">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant col-span-2">No photos uploaded</p>
            )}
          </div>

          {campaign.ngo_contact && (
            <div className="bg-surface-container-lowest rounded-[20px] p-4 border border-outline-variant/10">
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest leading-none mb-1">NGO Contact</p>
              <p className="text-sm font-semibold text-on-surface">{campaign.ngo} · {campaign.ngo_contact}</p>
            </div>
          )}

          <div className="bg-tertiary-container/20 border border-tertiary/10 rounded-[16px] p-4">
            <p className="text-xs text-on-surface-variant">
              By approving, {campaign.funding_required} EURC will be released to {campaign.ngo}. You can use these photos for marketing and ESG reporting.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              style={{ padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
              className="flex-1 bg-surface-container text-on-surface-variant active:scale-95 transition-transform"
              onClick={() => setConfirmAction({ type: 'reject', campaignId: campaign.id })}
            >
              Reject
            </button>
            <button
              style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
              className="flex-1 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              onClick={() => setConfirmAction({ type: 'approve', campaignId: campaign.id })}
            >
              Approve
            </button>
          </div>
          <p className="text-[10px] text-on-surface-variant text-center uppercase tracking-wider">
            Auto-releases in 7 days if no action taken
          </p>
          {confirmDialog}
        </Page.Main>
      </>
    );
  }

  // Campaign detail — any other status (view only)
  if (campaign) {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedCampaign(null)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface truncate">{campaign.title}</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          {campaignInfoRows(campaign)}

          {campaign.status === 'Completed' && (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-primary/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-primary text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="font-headline font-bold text-on-surface">{campaign.funding_required} EURC released</p>
              <p className="text-xs text-on-surface-variant mt-1">Campaign completed successfully</p>
            </div>
          )}

          {campaign.status === 'Expired' && (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-error/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-error text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
              <p className="font-headline font-bold text-on-surface">Campaign expired</p>
              <p className="text-xs text-on-surface-variant mt-1">Sponsor can claim refund from their wallet</p>
            </div>
          )}

          {photos.length > 0 && (
            <>
              <p className="font-headline font-bold text-on-surface">Event Photos</p>
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="aspect-square bg-surface-container rounded-[16px] overflow-hidden">
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
      <Page.Header>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">{businessName || 'Business'}</h2>
          <button onClick={() => router.push('/debug')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
        <nav className="flex gap-1.5">
          <button
            onClick={() => setTab('browse')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'browse' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Available
          </button>
          <button
            onClick={() => setTab('review')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'review' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Review
          </button>
          <button
            onClick={() => setTab('sponsored')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'sponsored' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Sponsored
          </button>
        </nav>
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        {tab === 'browse' && (
          <>
            <p className="text-sm text-gray-500">Campaigns looking for sponsors</p>
            {openCampaigns.length === 0 && <p className="text-center text-gray-400 mt-4">No campaigns need sponsoring</p>}
            {openCampaigns.map((c) => {
              const goal = goals.find((g) => g.id === c.goal_id);
              return (
                <CampaignCard key={c.id} title={c.title} category={goal?.category ?? ''} location={c.location} coverImage={c.cover_image} ngo={c.ngo} onClick={() => setSelectedCampaign(c.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-primary font-bold text-sm">{c.funding_required} EURC</span>
                      {c.interest_count > 0 && <span className="text-[10px] text-on-surface-variant font-medium uppercase mt-0.5">{c.interest_count} signed up</span>}
                    </div>
                    <span className="impact-gradient px-4 py-2 rounded-xl text-white text-xs font-bold uppercase tracking-wider">Sponsor</span>
                  </div>
                </CampaignCard>
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
                <CampaignCard key={c.id} title={c.title} category={goal?.category ?? ''} location={c.location} coverImage={c.cover_image} ngo={c.ngo} onClick={() => setSelectedCampaign(c.id)}>
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-bold text-sm">{c.funding_required} EURC</span>
                    <span className="px-4 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider">Review</span>
                  </div>
                </CampaignCard>
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
                <CampaignCard key={c.id} title={c.title} category={goal?.category ?? ''} location={c.location} coverImage={c.cover_image} ngo={c.ngo} onClick={() => setSelectedCampaign(c.id)}>
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-bold text-sm">{c.funding_required} EURC</span>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${
                      c.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
                      c.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                      c.status === 'Expired' ? 'bg-red-100 text-red-800' :
                      'bg-surface-container text-on-surface-variant'
                    }`}>{c.status}</span>
                  </div>
                </CampaignCard>
              );
            })}
          </>
        )}
      </Page.Main>
    </>
  );
}
