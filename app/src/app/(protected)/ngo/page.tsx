'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { CampaignCard } from '@/components/CampaignCard';
import { Page } from '@/components/PageLayout';
import { formatDate, formatStatus } from '@/lib/utils';
import type { Campaign, Goal } from '@/lib/db';
import { MiniKit } from '@worldcoin/minikit-js';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Settings } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { createPublicClient, encodeFunctionData, http, parseUnits } from 'viem';
import { worldchain } from 'viem/chains';

const client = createPublicClient({
  chain: worldchain,
  transport: http('https://worldchain-mainnet.g.alchemy.com/public'),
});

function NewCampaignForm({
  goals,
  ngoName,
  ngoEmail,
  onCreated,
  onBack,
}: {
  goals: Goal[];
  ngoName: string;
  ngoEmail: string;
  onCreated: () => void;
  onBack: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const { poll } = useUserOperationReceipt({ client });
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null);
  const [form, setForm] = useState({
    goal_id: goals[0]?.id ?? 1,
    title: '',
    description: '',
    funding_required: '',
    min_volunteers: 10,
    max_volunteers: 30,
    event_date: '',
    location: '',
  });

  const set = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!ngoName) return;
    setSubmitting(true);
    try {
      // Create in SQLite first to get the canonical ID
      const formData = new FormData();
      formData.append('goal_id', String(form.goal_id));
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('location', form.location);
      formData.append('event_date', form.event_date);
      formData.append('funding_required', form.funding_required);
      formData.append('min_volunteers', String(form.min_volunteers));
      formData.append('max_volunteers', String(form.max_volunteers));
      formData.append('ngo', ngoName);
      if (ngoEmail) formData.append('ngo_contact', ngoEmail);
      if (coverPhoto) formData.append('cover_image', coverPhoto);

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        body: formData,
      });
      const { id: campaignId } = await res.json();

      // Create on-chain with the same ID
      try {
        const now = new Date();
        const sponsorshipDeadline = Math.floor(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).getTime() / 1000);
        const eventDeadline = Math.floor(new Date(new Date(form.event_date).getTime() + 30 * 24 * 60 * 60 * 1000).getTime() / 1000);
        const fundingAmount = parseUnits(form.funding_required, 6);

        const result = await MiniKit.sendTransaction({
          chainId: 480,
          transactions: [
            {
              to: CAMPAIGN_ESCROW_ADDRESS,
              data: encodeFunctionData({
                abi: CAMPAIGN_ESCROW_ABI,
                functionName: 'createCampaign',
                args: [
                  BigInt(campaignId),
                  fundingAmount,
                  BigInt(form.min_volunteers),
                  BigInt(sponsorshipDeadline),
                  BigInt(eventDeadline),
                ],
              }),
            },
          ],
        });
        await poll(result.data.userOpHash);
      } catch (err) {
        console.error('On-chain campaign creation failed:', err);
        // SQLite campaign still created — works offline, on-chain can be retried
      }

      onCreated();
    } catch (err) {
      console.error('Create campaign error:', err);
      alert('Failed to create campaign. Please try again.');
    }
    setSubmitting(false);
  };

  const inputStyle = "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-[16px] p-3.5 text-sm text-on-surface focus:outline-none focus:border-primary/50";
  const labelStyle = "text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5";

  return (
    <>
      <Page.Header>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">New Campaign</h2>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pt-2">
        {/* Cover photo */}
        <div>
          <label className={labelStyle}>Cover photo</label>
          {coverPhoto ? (
            <div className="relative h-40 rounded-[16px] overflow-hidden">
              <img src={URL.createObjectURL(coverPhoto)} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setCoverPhoto(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white text-sm"
              >
                &times;
              </button>
            </div>
          ) : (
            <label className="block bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-[16px] p-8 text-center cursor-pointer">
              <span className="material-symbols-outlined text-on-surface-variant text-3xl mb-1">add_photo_alternate</span>
              <p className="text-on-surface-variant text-xs">Tap to add cover photo</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCoverPhoto(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        <div>
          <label className={labelStyle}>Goal</label>
          <select className={inputStyle} value={form.goal_id} onChange={(e) => set('goal_id', Number(e.target.value))}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelStyle}>Title</label>
          <input className={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className={labelStyle}>Description</label>
          <textarea className={inputStyle} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <label className={labelStyle}>Location</label>
          <input className={inputStyle} value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div>
          <label className={labelStyle}>Funding (EURC)</label>
          <input type="number" className={inputStyle} value={form.funding_required} onChange={(e) => set('funding_required', e.target.value)} />
        </div>

        {/* Volunteer range */}
        <div>
          <label className={labelStyle}>Volunteers</label>
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-[16px] p-4">
            <div className="flex justify-between mb-3">
              <div className="text-center">
                <p className="font-headline text-xl font-extrabold text-primary">{form.min_volunteers}</p>
                <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider">Min</p>
              </div>
              <div className="text-center">
                <p className="font-headline text-xl font-extrabold text-on-surface">{form.max_volunteers}</p>
                <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider">Max</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={form.min_volunteers}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set('min_volunteers', v);
                    if (v > form.max_volunteers) set('max_volunteers', v);
                  }}
                  className="w-full accent-primary"
                />
              </div>
              <div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={form.max_volunteers}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set('max_volunteers', v);
                    if (v < form.min_volunteers) set('min_volunteers', v);
                  }}
                  className="w-full accent-on-surface"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className={labelStyle}>Event date</label>
          <input type="date" className={inputStyle} value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
        </div>
        <button
          style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
          className="shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Creating...' : 'Create Campaign'}
        </button>
      </Page.Main>
    </>
  );
}

export default function NgoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { poll } = useUserOperationReceipt({ client });
  const [ngoName, setNgoName] = useState('');
  const [ngoEmail, setNgoEmail] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [campaignPhotos, setCampaignPhotos] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [refreshKey]);

  // Load NGO profile
  useEffect(() => {
    const wallet = session?.user?.walletAddress;
    if (wallet) {
      fetch(`/api/user-role?wallet=${wallet}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.name) setNgoName(data.name);
          if (data.email) setNgoEmail(data.email);
        });
    }
  }, [session]);

  const ngoCampaigns = ngoName ? campaigns.filter((c) => c.ngo === ngoName) : [];
  const campaign = selectedCampaign !== null ? campaigns.find((c) => c.id === selectedCampaign) : null;

  const [qrValue, setQrValue] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCampaign !== null) {
      fetch(`/api/campaigns/photos?campaignId=${selectedCampaign}`)
        .then((r) => r.json())
        .then(setCampaignPhotos);
    } else {
      setCampaignPhotos([]);
    }
  }, [selectedCampaign, refreshKey]);

  useEffect(() => {
    if (showQR && campaign) {
      fetch('/api/checkin-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      })
        .then((r) => r.json())
        .then((data) => setQrValue(`civic:${data.campaignId}:${data.token}`));
    } else {
      setQrValue(null);
    }
  }, [showQR, campaign]);

  // New campaign form
  if (showNewCampaign) {
    return <NewCampaignForm goals={goals} ngoName={ngoName} ngoEmail={ngoEmail} onCreated={() => { setShowNewCampaign(false); setRefreshKey((k) => k + 1); }} onBack={() => setShowNewCampaign(false)} />;
  }

  if (showQR && campaign) {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowQR(false)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Check-In QR</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col items-center justify-center gap-6">
          <div className="bg-surface-container-lowest rounded-[24px] p-8 border border-outline-variant/10 shadow-sm">
            {qrValue ? (
              <QRCodeSVG value={qrValue} size={220} />
            ) : (
              <div className="w-[220px] h-[220px] flex items-center justify-center">
                <p className="text-on-surface-variant text-sm">Generating...</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="font-headline font-bold text-on-surface">{campaign.title}</p>
            <p className="text-sm text-on-surface-variant mt-1">
              Show this to volunteers to check in
            </p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] px-6 py-3 border border-outline-variant/10">
            <span className="font-headline text-xl font-extrabold text-primary">{campaign.volunteer_count}</span>
            <span className="text-on-surface-variant text-sm">/{campaign.max_volunteers} checked in</span>
          </div>
        </Page.Main>
      </>
    );
  }

  // Submit completion with photos
  if (showSubmit && campaign) {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSubmit(false)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Submit Completion</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          <div className="bg-tertiary-container/20 border border-tertiary/10 rounded-[16px] p-4">
            <p className="text-xs text-on-surface-variant">
              Upload photos from the event. The sponsor will review them before funds are released.
            </p>
          </div>

          <p className="font-headline font-bold text-on-surface">Event Photos</p>

          <div className="grid grid-cols-2 gap-3">
            {selectedPhotos.map((f, i) => (
              <div key={i} className="aspect-square bg-surface-container rounded-[16px] overflow-hidden relative">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <label className="aspect-square bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-[16px] flex flex-col items-center justify-center cursor-pointer">
              <span className="material-symbols-outlined text-on-surface-variant text-2xl mb-1">add_photo_alternate</span>
              <p className="text-on-surface-variant text-xs">Add photo</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedPhotos((p) => [...p, file]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-container-lowest rounded-[20px] p-3 text-center border border-outline-variant/10">
              <p className="font-headline text-lg font-extrabold text-primary">{campaign.volunteer_count}</p>
              <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider mt-0.5">checked in</p>
            </div>
            <div className="bg-surface-container-lowest rounded-[20px] p-3 text-center border border-outline-variant/10">
              <p className="font-headline text-lg font-extrabold text-on-surface">{campaign.min_volunteers}</p>
              <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider mt-0.5">min needed</p>
            </div>
            <div className="bg-surface-container-lowest rounded-[20px] p-3 text-center border border-outline-variant/10">
              <p className="font-headline text-lg font-extrabold text-primary">{campaign.funding_required}</p>
              <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider mt-0.5">EURC</p>
            </div>
          </div>

          <button
            style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
            className="shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            onClick={async () => {
              try {
                // Upload photos + update SQLite first
                const formData = new FormData();
                formData.append('campaignId', String(campaign.id));
                selectedPhotos.forEach((f) => formData.append('photos', f));

                const res = await fetch('/api/campaigns/submit', {
                  method: 'POST',
                  body: formData,
                });
                if (!res.ok) {
                  const data = await res.json();
                  alert(data.error);
                  return;
                }

                // Then submit on-chain
                try {
                  const result = await MiniKit.sendTransaction({
                    chainId: 480,
                    transactions: [
                      {
                        to: CAMPAIGN_ESCROW_ADDRESS,
                        data: encodeFunctionData({
                          abi: CAMPAIGN_ESCROW_ABI,
                          functionName: 'submitCompletion',
                          args: [BigInt(campaign.id)],
                        }),
                      },
                    ],
                  });
                  await poll(result.data.userOpHash);
                } catch (err) {
                  console.error('On-chain submit failed:', err);
                  // SQLite already updated — on-chain can be retried
                }

                setSelectedPhotos([]);
                setShowSubmit(false);
                setSelectedCampaign(null);
                setRefreshKey((k) => k + 1);
              } catch (err) {
                console.error('Submit completion error:', err);
                alert('Failed to submit. Please try again.');
              }
            }}
          >
            Submit for Review
          </button>
          <p className="text-[10px] text-on-surface-variant text-center uppercase tracking-wider">
            Sponsor has 7 days to review. Funds auto-release after that.
          </p>
        </Page.Main>
      </>
    );
  }

  // Campaign detail
  if (campaign) {
    const goal = goals.find((g) => g.id === campaign.goal_id);
    const canComplete = campaign.status === 'Active' && campaign.volunteer_count >= campaign.min_volunteers;

    // #17: check if 7-day review period has passed for auto-release
    const reviewExpired = campaign.status === 'PendingReview' &&
      new Date(campaign.event_date).getTime() + 7 * 24 * 60 * 60 * 1000 < Date.now();

    const handleAutoRelease = async () => {
      try {
        const result = await MiniKit.sendTransaction({
          chainId: 480,
          transactions: [
            {
              to: CAMPAIGN_ESCROW_ADDRESS,
              data: encodeFunctionData({
                abi: CAMPAIGN_ESCROW_ABI,
                functionName: 'autoRelease',
                args: [BigInt(campaign.id)],
              }),
            },
          ],
        });
        await poll(result.data.userOpHash);

        await fetch('/api/campaigns/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign.id }),
        });
        setSelectedCampaign(null);
        setRefreshKey((k) => k + 1);
      } catch (err) {
        console.error('Auto-release error:', err);
        alert('Failed to release funds. Please try again.');
      }
    };

    const isToday = new Date().toISOString().split('T')[0] >= campaign.event_date;
    const progress = isToday ? Math.min(campaign.volunteer_count / campaign.min_volunteers, 1) : 0;
    const days = Math.ceil((new Date(campaign.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

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
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-white/90 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full border border-outline-variant/10">{goal?.category}</span>
            <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
              campaign.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
              campaign.status === 'Active' ? 'bg-blue-100 text-blue-800' :
              campaign.status === 'Open' ? 'bg-amber-100 text-amber-800' :
              campaign.status === 'PendingReview' ? 'bg-purple-100 text-purple-800' :
              campaign.status === 'Expired' ? 'bg-red-100 text-red-800' :
              'bg-surface-container text-on-surface-variant'
            }`}>{formatStatus(campaign.status)}</span>
          </div>

          <p className="text-sm text-on-surface-variant">{campaign.description}</p>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">location_on</span>
              <span className="text-on-surface">{campaign.location}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">event</span>
              <span className="text-on-surface">
                {formatDate(campaign.event_date)}
                {days < 0 && <span className="text-on-surface-variant"> · {-days}d ago</span>}
                {days === 0 && <span className="text-primary font-semibold"> · Today</span>}
                {days > 0 && <span className="text-on-surface-variant"> · in {days}d</span>}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">payments</span>
              <span className="text-on-surface">{campaign.funding_required} EURC</span>
            </div>
            {campaign.sponsor ? (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">handshake</span>
                <span className="text-on-surface">{campaign.sponsor}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">hourglass_empty</span>
                <span className="text-on-surface-variant">Sponsor by {formatDate(campaign.sponsorship_deadline)}</span>
              </div>
            )}
            {campaign.status === 'Active' && (
              <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-lg">schedule</span>
                <span>Submit evidence by {formatDate(campaign.event_deadline)}</span>
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {isToday ? (
                <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                  <p className="font-headline text-2xl font-extrabold text-primary">{campaign.volunteer_count}/{campaign.min_volunteers}</p>
                  <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">checked in</p>
                </div>
              ) : (
                <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                  <p className="font-headline text-2xl font-extrabold text-on-surface">{campaign.min_volunteers}–{campaign.max_volunteers}</p>
                  <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">needed</p>
                </div>
              )}
              <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                <p className="font-headline text-2xl font-extrabold text-tertiary">{campaign.interest_count}</p>
                <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">signed up</p>
              </div>
            </div>
            {isToday && campaign.volunteer_count > 0 && (
              <div>
                <div className="w-full bg-surface-container-high rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${progress >= 1 ? 'bg-primary' : 'bg-amber-500'}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant font-medium mt-1.5 text-center">
                  {progress >= 1 ? 'Minimum reached — ready to submit!' : `${campaign.min_volunteers - campaign.volunteer_count} more needed`}
                </p>
              </div>
            )}
          </div>

          {campaign.status === 'Active' && new Date().toISOString().split('T')[0] <= campaign.event_date && (
            <button
              style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
              className="shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              onClick={() => setShowQR(true)}
            >
              Show Check-In QR
            </button>
          )}

          {canComplete && (
            <button
              style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
              className="shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              onClick={() => setShowSubmit(true)}
            >
              Submit Completion
            </button>
          )}

          {campaign.status === 'PendingReview' && (
            <>
              {campaignPhotos.length > 0 && (
                <>
                  <p className="font-headline font-bold text-on-surface">Submitted Photos</p>
                  <div className="grid grid-cols-2 gap-3">
                    {campaignPhotos.map((p, i) => (
                      <div key={i} className="aspect-square bg-surface-container rounded-[16px] overflow-hidden">
                        <img src={p} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {reviewExpired ? (
                <button
                  style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}
                  className="shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                  onClick={handleAutoRelease}
                >
                  Release Funds
                </button>
              ) : (
                <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-amber-200/50 text-center">
                  <span className="material-symbols-outlined text-amber-600 text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>pending</span>
                  <p className="font-headline font-bold text-on-surface">Awaiting Review</p>
                  <p className="text-xs text-on-surface-variant mt-1">Funds auto-release after 7 days if no response</p>
                </div>
              )}
            </>
          )}

          {campaign.status === 'Completed' && (
            <>
              {campaignPhotos.length > 0 && (
                <>
                  <p className="font-headline font-bold text-on-surface">Event Photos</p>
                  <div className="grid grid-cols-2 gap-3">
                    {campaignPhotos.map((p, i) => (
                      <div key={i} className="aspect-square bg-surface-container rounded-[16px] overflow-hidden">
                        <img src={p} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-primary/20 text-center shadow-sm">
                <span className="material-symbols-outlined text-primary text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <p className="font-headline font-bold text-on-surface">{campaign.funding_required} EURC released</p>
                <p className="text-xs text-on-surface-variant mt-1">Campaign completed successfully</p>
              </div>
            </>
          )}

          {campaign.status === 'Expired' && (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-error/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-error text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
              <p className="font-headline font-bold text-on-surface">Campaign expired</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {campaign.sponsor ? 'Sponsor can claim refund from their wallet' : 'No sponsor found before deadline'}
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
      <Page.Header>
        <div className="flex justify-between items-center">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">{ngoName || 'NGO'}</h2>
          <button onClick={() => router.push('/debug')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-5 pt-2">
        <div className="flex justify-between items-center">
          <p className="font-headline font-bold text-on-surface">Your Campaigns</p>
          <button onClick={() => setShowNewCampaign(true)} className="px-4 py-2 rounded-full bg-surface-container-low text-primary text-xs font-semibold">
            + New Campaign
          </button>
        </div>

        {ngoCampaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            <span className="material-symbols-outlined text-6xl text-outline-variant">add_circle</span>
            <p className="font-headline font-bold text-on-surface-variant">No campaigns yet</p>
            <p className="text-sm text-on-surface-variant">Create your first campaign to get started!</p>
          </div>
        )}

        {ngoCampaigns.map((c) => {
          const goal = goals.find((g) => g.id === c.goal_id);
          return (
            <CampaignCard key={c.id} title={c.title} category={goal?.category ?? ''} location={c.location} coverImage={c.cover_image} sponsor={c.sponsor} onClick={() => setSelectedCampaign(c.id)}>
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold text-sm">{c.funding_required} EURC</span>
                <span className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${
                  c.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
                  c.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                  c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                  c.status === 'PendingReview' ? 'bg-purple-100 text-purple-800' :
                  'bg-surface-container text-on-surface-variant'
                }`}>{formatStatus(c.status)}</span>
              </div>
            </CampaignCard>
          );
        })}
      </Page.Main>
    </>
  );
}
