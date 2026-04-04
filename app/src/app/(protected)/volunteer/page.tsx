'use client';

import { Page } from '@/components/PageLayout';
import type { Campaign, CivicReward, Goal } from '@/lib/db';
import { IDKit, orbLegacy, type RpContext } from '@worldcoin/idkit';
import { Button, Chip, LiveFeedback, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function QrScanner({
  campaignId,
  onSuccess,
  onError,
}: {
  campaignId: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (text) => {
          // Expected format: civic:campaignId:token
          const parts = text.split(':');
          if (parts.length !== 3 || parts[0] !== 'civic') {
            await scanner.stop();
            onError('Not a valid check-in QR code');
            return;
          }
          const scannedCampaignId = parseInt(parts[1]);
          const token = parts[2];

          if (scannedCampaignId !== campaignId) {
            await scanner.stop();
            onError('Wrong campaign QR code');
            return;
          }

          // Validate token with backend
          const res = await fetch('/api/checkin-token', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: scannedCampaignId, token }),
          });
          const data = await res.json();
          await scanner.stop();

          if (data.valid) {
            onSuccess();
          } else {
            onError('Invalid or expired QR code');
          }
        },
        () => {}, // ignore scan failures (no QR in frame)
      )
      .then(() => setScanning(true))
      .catch(() => onError('Could not access camera'));

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [campaignId, onSuccess, onError]);

  return (
    <div className="space-y-3">
      <div id="qr-reader" className="rounded-xl overflow-hidden" />
      {!scanning && (
        <p className="text-sm text-gray-400 text-center">Starting camera...</p>
      )}
      <p className="text-sm text-gray-600 text-center">
        Scan the QR code from the NGO coordinator
      </p>
    </div>
  );
}

function WorldIdCheckIn({
  campaignId,
  walletAddress,
  onSuccess,
  onError,
}: {
  campaignId: number;
  walletAddress: string;
  onSuccess: () => void;
  onError: () => void;
}) {
  const [state, setState] = useState<'pending' | 'success' | 'failed' | undefined>(undefined);

  const handleVerify = async () => {
    setState('pending');
    try {
      const action = 'checkin';

      // Get RP signature
      const rpRes = await fetch('/api/rp-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!rpRes.ok) throw new Error('Failed to get RP signature');

      const rpSig = await rpRes.json();
      const rpContext: RpContext = {
        rp_id: rpSig.rp_id,
        nonce: rpSig.nonce,
        created_at: rpSig.created_at,
        expires_at: rpSig.expires_at,
        signature: rpSig.sig,
      };

      // IDKit request
      const request = await IDKit.request({
        app_id: process.env.NEXT_PUBLIC_APP_ID as `app_${string}`,
        action,
        rp_context: rpContext,
        allow_legacy_proofs: true,
      }).preset(orbLegacy({ signal: `${campaignId}-${Date.now()}` }));

      const completion = await request.pollUntilCompletion();
      if (!completion.success) {
        setState('failed');
        setTimeout(() => { setState(undefined); onError(); }, 2000);
        return;
      }

      // Verify on backend
      const verifyRes = await fetch('/api/verify-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: completion.result, campaignId, walletAddress }),
      });
      const data = await verifyRes.json();

      if (data.verifyRes.success) {
        setState('success');
        setTimeout(onSuccess, 1000);
      } else {
        setState('failed');
        setTimeout(() => { setState(undefined); onError(); }, 2000);
      }
    } catch {
      setState('failed');
      setTimeout(() => { setState(undefined); onError(); }, 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
        <p className="text-sm text-blue-800">QR verified! Now confirm your identity.</p>
      </div>
      <LiveFeedback
        label={{
          failed: 'Verification failed',
          pending: 'Verifying...',
          success: 'Verified!',
        }}
        state={state}
        className="w-full"
      >
        <Button
          onClick={handleVerify}
          disabled={state === 'pending'}
          size="lg"
          variant="primary"
          className="w-full"
        >
          Verify with World ID
        </Button>
      </LiveFeedback>
    </div>
  );
}

export default function VolunteerPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [step, setStep] = useState<'browse' | 'scan' | 'verify' | 'done'>('browse');
  const [showRewards, setShowRewards] = useState(false);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkedInCampaigns, setCheckedInCampaigns] = useState<number[]>([]);
  const [claimedCampaigns, setClaimedCampaigns] = useState<number[]>([]);
  const [rewards, setRewards] = useState<CivicReward[]>([]);
  const [claimedReward, setClaimedReward] = useState<CivicReward | null>(null);
  const [claiming, setClaiming] = useState(false);

  const walletAddress = session?.user?.walletAddress;

  // Load campaigns + goals
  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [step, claiming]);

  // Load check-in status + claim status
  useEffect(() => {
    if (walletAddress) {
      fetch('/api/checkin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
        .then((r) => r.json())
        .then((data) => setCheckedInCampaigns(data.campaigns));

      fetch('/api/rewards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
        .then((r) => r.json())
        .then((data) => setClaimedCampaigns(data.claimedCampaigns));
    }
  }, [walletAddress, step, claiming]);

  // Load rewards
  useEffect(() => {
    fetch('/api/rewards').then((r) => r.json()).then((data) => setRewards(data.rewards));
  }, [claiming]);

  // Load claimed reward for selected campaign
  useEffect(() => {
    if (walletAddress && selectedCampaign !== null) {
      fetch('/api/rewards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, campaignId: selectedCampaign }),
      })
        .then((r) => r.json())
        .then((data) => setClaimedReward(data.claimedReward));
    } else {
      setClaimedReward(null);
    }
  }, [walletAddress, selectedCampaign, claiming]);

  const activeCampaigns = campaigns.filter((c) => c.status === 'Active');
  const completedCampaigns = campaigns.filter(
    (c) => c.status === 'Completed' && checkedInCampaigns.includes(c.id)
  );
  const campaign = selectedCampaign !== null ? campaigns.find((c) => c.id === selectedCampaign) : null;
  const goal = campaign ? goals.find((g) => g.id === campaign.goal_id) : null;
  const isAlreadyCheckedIn = campaign ? checkedInCampaigns.includes(campaign.id) : false;
  const hasClaimedReward = campaign ? claimedCampaigns.includes(campaign.id) : false;

  const totalRewardsLeft = rewards.reduce((s, r) => s + r.remaining, 0);

  const handleClaimReward = async (rewardId: number) => {
    if (!walletAddress || !campaign) return;
    setClaiming(true);
    await fetch('/api/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, rewardId, campaignId: campaign.id }),
    });
    setClaiming(false);
  };

  // Reward pool overlay
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
          {rewards.map((r) => (
            <div key={r.id} className="bg-white border rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{r.name}</p>
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

  // Completed campaign detail — claim reward
  if (campaign && goal && campaign.status === 'Completed') {
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
          <Chip label="Completed" />
          <p className="text-sm text-gray-600">{campaign.location}</p>
          <p>{campaign.description}</p>

          {hasClaimedReward && claimedReward ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-green-800">Reward claimed!</p>
              <p className="text-sm text-green-600 mt-1">{claimedReward.name}</p>
              {claimedReward.file_path && (
                <a
                  href={claimedReward.file_path}
                  className="text-sm text-blue-600 underline mt-2 block"
                  download
                >
                  Download ticket
                </a>
              )}
            </div>
          ) : (
            <>
              <p className="font-semibold">Choose your reward</p>
              {rewards.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleClaimReward(r.id)}
                  disabled={r.remaining <= 0 || claiming}
                  className={`text-left border rounded-xl p-4 flex justify-between items-center ${
                    r.remaining <= 0 ? 'opacity-50' : 'bg-white'
                  }`}
                >
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-gray-500">{r.remaining} left</p>
                </button>
              ))}
              {totalRewardsLeft === 0 && (
                <p className="text-sm text-amber-600 text-center">
                  No rewards available right now. Check back later.
                </p>
              )}
            </>
          )}
        </Page.Main>
      </>
    );
  }

  // Active campaign detail + check-in flow
  if (campaign && goal) {
    const spotsLeft = campaign.max_volunteers - campaign.volunteer_count;

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
              {campaign.volunteer_count}/{campaign.max_volunteers}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Deadline:</span> {campaign.event_deadline}
            </p>
          </div>

          {step === 'browse' && isAlreadyCheckedIn && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-green-800">Checked in!</p>
              <p className="text-sm text-green-600 mt-1">
                You'll receive civic rewards when the campaign completes.
              </p>
            </div>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && (
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
            <QrScanner
              campaignId={campaign.id}
              onSuccess={() => setStep('verify')}
              onError={(msg) => {
                alert(msg);
                setStep('browse');
              }}
            />
          )}

          {step === 'verify' && walletAddress && (
            <WorldIdCheckIn
              campaignId={campaign.id}
              walletAddress={walletAddress}
              onSuccess={() => setStep('done')}
              onError={() => setStep('browse')}
            />
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

  // Campaign list with tabs
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
        <div className="flex gap-2">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg ${tab === 'active' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Active ({activeCampaigns.length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg ${tab === 'completed' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Completed ({completedCampaigns.length})
          </button>
        </div>

        {tab === 'active' && activeCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          const spotsLeft = c.max_volunteers - c.volunteer_count;
          const checkedIn = checkedInCampaigns.includes(c.id);
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
                <span>{c.volunteer_count}/{c.max_volunteers} volunteers</span>
                {checkedIn && <span className="text-green-600">Checked in</span>}
                {!checkedIn && spotsLeft <= 5 && <span className="text-amber-600">{spotsLeft} spots left</span>}
              </div>
            </button>
          );
        })}

        {tab === 'active' && activeCampaigns.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No active campaigns right now.</p>
        )}

        {tab === 'completed' && completedCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          const claimed = claimedCampaigns.includes(c.id);
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
              <p className="text-sm">
                {claimed
                  ? <span className="text-green-600">Reward claimed</span>
                  : <span className="text-amber-600">Claim your reward</span>
                }
              </p>
            </button>
          );
        })}

        {tab === 'completed' && completedCampaigns.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No completed campaigns yet.</p>
        )}
      </Page.Main>
    </>
  );
}
