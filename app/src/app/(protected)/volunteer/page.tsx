'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { Page } from '@/components/PageLayout';
import type { Campaign, CivicReward, Goal, RewardSummary } from '@/lib/db';
import { IDKit, orbLegacy, type RpContext } from '@worldcoin/idkit';
import { MiniKit } from '@worldcoin/minikit-js';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { Button, Chip, LiveFeedback, Tabs, TabItem, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Compass } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { Compass as CompassSolid } from '@worldcoin/mini-apps-ui-kit-react/icons/solid';
import { User } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { User as UserSolid } from '@worldcoin/mini-apps-ui-kit-react/icons/solid';
import { Html5Qrcode } from 'html5-qrcode';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPublicClient, decodeAbiParameters, encodeFunctionData, http } from 'viem';
import { worldchain } from 'viem/chains';

// --- QR Scanner ---

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
          // TODO: remove debug bypass — accept any QR code for testing
          await scanner.stop();
          onSuccess();
          return;

          // Original QR validation logic:
          // const parts = text.split(':');
          // if (parts.length !== 3 || parts[0] !== 'civic') {
          //   await scanner.stop();
          //   onError('Not a valid check-in QR code');
          //   return;
          // }
          // const scannedCampaignId = parseInt(parts[1]);
          // const token = parts[2];
          //
          // if (scannedCampaignId !== campaignId) {
          //   await scanner.stop();
          //   onError('Wrong campaign QR code');
          //   return;
          // }
          //
          // const res = await fetch('/api/checkin-token', {
          //   method: 'PUT',
          //   headers: { 'Content-Type': 'application/json' },
          //   body: JSON.stringify({ campaignId: scannedCampaignId, token }),
          // });
          // const data = await res.json();
          // await scanner.stop();
          //
          // if (data.valid) {
          //   onSuccess();
          // } else {
          //   onError('Invalid or expired QR code');
          // }
        },
        () => {},
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

// --- World ID Check-In ---

const client = createPublicClient({
  chain: worldchain,
  transport: http('https://worldchain-mainnet.g.alchemy.com/public'),
});

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
  const { poll } = useUserOperationReceipt({ client });

  const handleVerify = async () => {
    setState('pending');
    try {
      const action = 'checkin';

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

      const request = await IDKit.request({
        app_id: process.env.NEXT_PUBLIC_APP_ID as `app_${string}`,
        action,
        rp_context: rpContext,
        allow_legacy_proofs: true,
      }).preset(orbLegacy({ signal: String(campaignId) }));

      const completion = await request.pollUntilCompletion();
      if (!completion.success) {
        setState('failed');
        setTimeout(() => { setState(undefined); onError(); }, 2000);
        return;
      }

      const verifyRes = await fetch('/api/verify-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: completion.result, campaignId, walletAddress }),
      });
      const data = await verifyRes.json();

      if (!data.verifyRes.success) {
        setState('failed');
        setTimeout(() => { setState(undefined); onError(); }, 2000);
        return;
      }

      if (data.v3Proof) {
        const { merkle_root, nullifier, proof } = data.v3Proof;
        const [unpackedProof] = decodeAbiParameters(
          [{ type: 'uint256[8]' }],
          proof as `0x${string}`,
        );

        const txResult = await MiniKit.sendTransaction({
          chainId: 480,
          transactions: [
            {
              to: CAMPAIGN_ESCROW_ADDRESS,
              data: encodeFunctionData({
                abi: CAMPAIGN_ESCROW_ABI,
                functionName: 'checkIn',
                args: [
                  BigInt(campaignId),
                  BigInt(merkle_root),
                  BigInt(nullifier),
                  unpackedProof,
                ],
              }),
            },
          ],
        });

        await poll(txResult.data.userOpHash);
      }

      setState('success');
      setTimeout(onSuccess, 1000);
    } catch (err) {
      console.error('Check-in error:', err);
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

// --- Profile View ---

function ProfileView({
  campaigns,
  goals,
  checkedInCampaigns,
  claimedCampaigns,
  rewards,
  walletAddress,
}: {
  campaigns: Campaign[];
  goals: Goal[];
  checkedInCampaigns: number[];
  claimedCampaigns: number[];
  rewards: RewardSummary[];
  walletAddress?: string;
}) {
  const myCampaigns = campaigns.filter((c) => checkedInCampaigns.includes(c.id));
  const completedUnclaimed = myCampaigns.filter(
    (c) => c.status === 'Completed' && !claimedCampaigns.includes(c.id),
  );
  const claimedList = myCampaigns.filter(
    (c) => claimedCampaigns.includes(c.id),
  );
  const activeCampaigns = myCampaigns.filter((c) => c.status === 'Active');
  const totalClaimed = claimedCampaigns.length;

  return (
    <>
      <Page.Header className="p-0">
        <TopBar title="My Profile" />
      </Page.Header>
      <Page.Main className="flex flex-col gap-4">
        {/* Stats */}
        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 text-center">
          <div>
            <p className="text-xl font-bold">{checkedInCampaigns.length}</p>
            <p className="text-xs text-gray-500">Check-ins</p>
          </div>
          <div>
            <p className="text-xl font-bold">{totalClaimed}</p>
            <p className="text-xs text-gray-500">Rewards</p>
          </div>
          <div>
            <p className="text-xl font-bold">{activeCampaigns.length}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
        </div>

        {/* Unclaimed rewards */}
        {completedUnclaimed.length > 0 && (
          <>
            <p className="font-semibold">Unclaimed Rewards</p>
            {completedUnclaimed.map((c) => {
              const g = goals.find((g) => g.id === c.goal_id);
              return (
                <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={g?.category ?? ''} />
                  </div>
                  <p className="text-sm text-amber-700">Campaign completed — claim your reward!</p>
                </div>
              );
            })}
          </>
        )}

        {/* Active check-ins */}
        {activeCampaigns.length > 0 && (
          <>
            <p className="font-semibold">Active Check-ins</p>
            {activeCampaigns.map((c) => {
              const g = goals.find((g) => g.id === c.goal_id);
              return (
                <div key={c.id} className="bg-white border rounded-xl p-4 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={g?.category ?? ''} />
                  </div>
                  <p className="text-sm text-gray-500">{c.location}</p>
                  <p className="text-sm text-green-600">Checked in</p>
                </div>
              );
            })}
          </>
        )}

        {/* Claimed rewards history */}
        {claimedList.length > 0 && (
          <>
            <p className="font-semibold">Claimed Rewards</p>
            {claimedList.map((c) => {
              const g = goals.find((g) => g.id === c.goal_id);
              return (
                <div key={c.id} className="bg-white border rounded-xl p-4 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={g?.category ?? ''} />
                  </div>
                  <p className="text-sm text-green-600">Reward claimed</p>
                </div>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {myCampaigns.length === 0 && (
          <div className="text-center mt-8">
            <p className="text-gray-500">No activity yet.</p>
            <p className="text-sm text-gray-400 mt-1">Check in to a campaign to get started!</p>
          </div>
        )}

        {/* Wallet address */}
        {walletAddress && (
          <div className="mt-4 bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Wallet</p>
            <p className="text-xs font-mono text-gray-600 truncate">{walletAddress}</p>
          </div>
        )}
      </Page.Main>
    </>
  );
}

// --- Main Page ---

export default function VolunteerPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [mainTab, setMainTab] = useState('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [step, setStep] = useState<'browse' | 'scan' | 'verify' | 'done'>('browse');
  const [showRewards, setShowRewards] = useState(false);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkedInCampaigns, setCheckedInCampaigns] = useState<number[]>([]);
  const [claimedCampaigns, setClaimedCampaigns] = useState<number[]>([]);
  const [rewards, setRewards] = useState<RewardSummary[]>([]);
  const [claimedReward, setClaimedReward] = useState<CivicReward | null>(null);
  const [claiming, setClaiming] = useState(false);

  const walletAddress = session?.user?.walletAddress;

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [step, claiming]);

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

  useEffect(() => {
    fetch('/api/rewards').then((r) => r.json()).then((data) => setRewards(data.rewards));
  }, [claiming]);

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

  const handleClaimReward = async (rewardName: string) => {
    if (!walletAddress || !campaign) return;
    setClaiming(true);
    await fetch('/api/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, rewardName, campaignId: campaign.id }),
    });
    setClaiming(false);
  };

  // --- Bottom Tab Bar (shown on list views, hidden on detail views) ---
  const showBottomTabs = selectedCampaign === null && !showRewards;

  const bottomTabs = (
    <Page.Footer className="border-t bg-white pb-3">
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabItem value="campaigns" icon={<Compass />} altIcon={<CompassSolid />} label="Campaigns" />
        <TabItem value="profile" icon={<User />} altIcon={<UserSolid />} label="Profile" />
      </Tabs>
    </Page.Footer>
  );

  // --- Profile Tab ---
  if (mainTab === 'profile') {
    return (
      <Page>
        <ProfileView
          campaigns={campaigns}
          goals={goals}
          checkedInCampaigns={checkedInCampaigns}
          claimedCampaigns={claimedCampaigns}
          rewards={rewards}
          walletAddress={walletAddress}
        />
        {bottomTabs}
      </Page>
    );
  }

  // --- Reward pool overlay ---
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
            <div key={r.name} className="bg-white border rounded-xl p-4 flex justify-between items-center">
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

  // --- Completed campaign detail — claim reward ---
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
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={async () => {
                    const res = await fetch(claimedReward.file_path);
                    const blob = await res.blob();
                    const filename = claimedReward.file_path.split('/').pop() ?? 'ticket';
                    const file = new File([blob], filename, { type: blob.type });
                    MiniKit.share({ files: [file] });
                  }}
                >
                  Save ticket
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="font-semibold">Choose your reward</p>
              {rewards.map((r) => (
                <button
                  key={r.name}
                  onClick={() => handleClaimReward(r.name)}
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

  // --- Active campaign detail + check-in flow ---
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
              <span className="font-semibold">Event date:</span> {campaign.event_date}
            </p>
          </div>

          {step === 'browse' && isAlreadyCheckedIn && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-green-800">Checked in!</p>
              <p className="text-sm text-green-600 mt-1">
                You&apos;ll receive civic rewards when the campaign completes.
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
                You&apos;ll receive civic rewards when the campaign completes.
              </p>
            </div>
          )}
        </Page.Main>
      </>
    );
  }

  // --- Campaign list with tabs ---
  return (
    <Page>
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
      {showBottomTabs && bottomTabs}
    </Page>
  );
}
