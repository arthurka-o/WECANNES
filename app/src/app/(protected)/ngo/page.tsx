'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { Page } from '@/components/PageLayout';
import { formatDate } from '@/lib/utils';
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
  const [form, setForm] = useState({
    goal_id: goals[0]?.id ?? 1,
    title: '',
    description: '',
    funding_required: '',
    min_volunteers: '',
    max_volunteers: '',
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
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ngo: ngoName,
          ngo_contact: ngoEmail || undefined,
          funding_required: Number(form.funding_required),
          min_volunteers: Number(form.min_volunteers),
          max_volunteers: Number(form.max_volunteers),
        }),
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

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="New Campaign"
          startAdornment={<button onClick={onBack}>← Back</button>}
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">Goal</label>
          <select
            className="w-full border rounded-lg p-3"
            value={form.goal_id}
            onChange={(e) => set('goal_id', Number(e.target.value))}
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Title</label>
          <input className="w-full border rounded-lg p-3" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Description</label>
          <textarea className="w-full border rounded-lg p-3" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Location</label>
          <input className="w-full border rounded-lg p-3" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-semibold block mb-1">Funding (EURC)</label>
            <input type="number" className="w-full border rounded-lg p-3" value={form.funding_required} onChange={(e) => set('funding_required', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1">Min volunteers</label>
            <input type="number" className="w-full border rounded-lg p-3" value={form.min_volunteers} onChange={(e) => set('min_volunteers', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Max volunteers</label>
          <input type="number" className="w-full border rounded-lg p-3" value={form.max_volunteers} onChange={(e) => set('max_volunteers', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Event date</label>
          <input type="date" className="w-full border rounded-lg p-3" value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
        </div>
        <Button size="lg" variant="primary" className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Campaign'}
        </Button>
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
        <Page.Header className="p-0">
          <TopBar
            title="Check-In QR"
            startAdornment={
              <button onClick={() => setShowQR(false)}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col items-center justify-center gap-4">
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={256} />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <p className="text-gray-400 text-sm">Generating...</p>
            </div>
          )}
          <p className="text-sm text-gray-600 text-center">
            Show this to volunteers so they can scan and check in.
          </p>
          <p className="text-xs text-gray-400">
            {campaign.volunteer_count}/{campaign.max_volunteers} checked in
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
            {selectedPhotos.map((f, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <label className="aspect-square bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer">
              <p className="text-gray-400 text-xs text-center">+ Add photo</p>
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

          <div className="bg-gray-50 rounded-lg p-4 space-y-1">
            <p className="text-sm"><span className="font-semibold">Volunteers:</span> {campaign.volunteer_count} checked in</p>
            <p className="text-sm"><span className="font-semibold">Min required:</span> {campaign.min_volunteers}</p>
            <p className="text-sm"><span className="font-semibold">Funding:</span> {campaign.funding_required} EURC</p>
          </div>

          <Button
            size="lg"
            variant="primary"
            className="w-full"
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

          <p className="text-sm text-gray-600">{campaign.description}</p>

          {/* Info rows */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-5 text-center">📍</span>
              <span>{campaign.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-5 text-center">📅</span>
              <span>
                {formatDate(campaign.event_date)}
                {campaign.status === 'Active' && (() => {
                  const days = Math.ceil((new Date(campaign.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  if (days < 0) return <span className="text-gray-400"> · {-days}d ago</span>;
                  if (days === 0) return <span className="text-green-600 font-semibold"> · Today</span>;
                  return <span className="text-gray-400"> · in {days}d</span>;
                })()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-5 text-center">💰</span>
              <span>{campaign.funding_required} EURC</span>
              {!campaign.sponsor && <Chip label="Needs sponsor" />}
            </div>
            {campaign.sponsor && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-5 text-center">🤝</span>
                <span>{campaign.sponsor}</span>
              </div>
            )}
            {campaign.status === 'Open' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-5 text-center">⏰</span>
                <span>Find sponsor by {formatDate(campaign.sponsorship_deadline)}</span>
              </div>
            )}
            {campaign.status === 'Active' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-5 text-center">⏰</span>
                <span>Submit evidence by {formatDate(campaign.event_deadline)}</span>
              </div>
            )}
          </div>

          {/* Stats grid */}
          {(() => {
            const isToday = new Date().toISOString().split('T')[0] >= campaign.event_date;
            const progress = isToday ? Math.min(campaign.volunteer_count / campaign.min_volunteers, 1) : 0;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {isToday ? (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold">{campaign.volunteer_count}/{campaign.min_volunteers}</p>
                      <p className="text-xs text-gray-500">checked in</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold">{campaign.min_volunteers}–{campaign.max_volunteers}</p>
                      <p className="text-xs text-gray-500">needed</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{campaign.interest_count}</p>
                    <p className="text-xs text-gray-500">signed up</p>
                  </div>
                </div>
                {isToday && (
                  <div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${progress >= 1 ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-center">
                      {progress >= 1
                        ? 'Minimum reached — ready to submit!'
                        : `${campaign.min_volunteers - campaign.volunteer_count} more needed to submit`}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {campaign.status === 'Active' && new Date().toISOString().split('T')[0] <= campaign.event_date && (
            <Button size="lg" variant="secondary" className="w-full" onClick={() => setShowQR(true)}>
              Show Check-In QR
            </Button>
          )}

          {canComplete && (
            <Button size="lg" variant="primary" className="w-full" onClick={() => setShowSubmit(true)}>
              Submit Completion
            </Button>
          )}

          {campaign.status === 'PendingReview' && (
            <>
              {campaignPhotos.length > 0 && (
                <>
                  <p className="font-semibold">Submitted Photos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {campaignPhotos.map((p, i) => (
                      <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img src={p} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {reviewExpired ? (
                <Button size="lg" variant="primary" className="w-full" onClick={handleAutoRelease}>
                  Release Funds (review period expired)
                </Button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-sm text-amber-800">Waiting for sponsor to review and approve</p>
                  <p className="text-xs text-amber-600 mt-1">Funds auto-release after 7 days if no response</p>
                </div>
              )}
            </>
          )}

          {campaign.status === 'Completed' && (
            <>
              {campaignPhotos.length > 0 && (
                <>
                  <p className="font-semibold">Event Photos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {campaignPhotos.map((p, i) => (
                      <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img src={p} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="font-semibold text-green-800">{campaign.funding_required} EURC released</p>
                <p className="text-sm text-green-600 mt-1">Campaign completed successfully</p>
              </div>
            </>
          )}

          {campaign.status === 'Expired' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-red-800">Campaign expired</p>
              <p className="text-sm text-red-600 mt-1">
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
      <Page.Header className="p-0">
        <TopBar
          title={ngoName || 'NGO'}
          endAdornment={<button onClick={() => router.push('/debug')}><Settings /></button>}
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <p className="font-semibold">Your Campaigns</p>
          <Button size="sm" variant="secondary" onClick={() => setShowNewCampaign(true)}>
            + New Campaign
          </Button>
        </div>

        {ngoCampaigns.map((c) => {
          const goal = goals.find((g) => g.id === c.goal_id);
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
                {c.interest_count > 0 ? `${c.interest_count} signed up · ` : ''}
                {c.volunteer_count > 0 ? `${c.volunteer_count} checked in · ` : ''}
                {c.funding_required} EURC
              </p>
            </button>
          );
        })}
      </Page.Main>
    </>
  );
}
