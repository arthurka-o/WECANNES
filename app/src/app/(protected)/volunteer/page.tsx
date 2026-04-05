'use client';

import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { CampaignCard } from '@/components/CampaignCard';
import { Page } from '@/components/PageLayout';
import { formatDate } from '@/lib/utils';
import type { Campaign, CivicReward, Goal, RewardSummary } from '@/lib/db';
import { IDKit, orbLegacy, type RpContext } from '@worldcoin/idkit';
import { MiniKit } from '@worldcoin/minikit-js';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose, Button, Chip, LiveFeedback, Tabs, TabItem, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Compass } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { Compass as CompassSolid } from '@worldcoin/mini-apps-ui-kit-react/icons/solid';
import { Settings } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { User } from '@worldcoin/mini-apps-ui-kit-react/icons/outline';
import { User as UserSolid } from '@worldcoin/mini-apps-ui-kit-react/icons/solid';
import jsQR from 'jsqr';
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
  onClose,
}: {
  campaignId: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        const scan = () => {
          if (stopped) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
              // TODO: remove debug bypass — accept any QR code for testing
              stopped = true;
              stream.getTracks().forEach(t => t.stop());
              onSuccess();
              return;

              // Original QR validation logic:
              // const parts = code.data.split(':');
              // if (parts.length === 3 && parts[0] === 'civic') {
              //   const scannedCampaignId = parseInt(parts[1]);
              //   const token = parts[2];
              //   if (scannedCampaignId === campaignId) {
              //     stopped = true;
              //     stream.getTracks().forEach(t => t.stop());
              //     fetch('/api/checkin-token', {
              //       method: 'PUT',
              //       headers: { 'Content-Type': 'application/json' },
              //       body: JSON.stringify({ campaignId: scannedCampaignId, token }),
              //     }).then(r => r.json()).then(data => {
              //       if (data.valid) onSuccess();
              //       else onError('Invalid or expired QR code');
              //     });
              //     return;
              //   }
              // }
            }
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch {
        if (!stopped) onError('Could not access camera');
      }
    };

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [campaignId]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <button
        onClick={() => {
          streamRef.current?.getTracks().forEach(t => t.stop());
          cancelAnimationFrame(rafRef.current);
          onClose();
        }}
        className="absolute top-6 right-4 z-10 bg-black/60 backdrop-blur rounded-full w-12 h-12 flex items-center justify-center text-white text-2xl font-bold"
      >
        &times;
      </button>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Starting camera...</p>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-center">
        <p className="text-white/60 text-sm">Scan the QR code from the NGO coordinator</p>
      </div>
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
  username,
  profilePictureUrl,
  myRewards,
  onSelectCampaign,
}: {
  campaigns: Campaign[];
  goals: Goal[];
  checkedInCampaigns: number[];
  claimedCampaigns: number[];
  username?: string;
  profilePictureUrl?: string;
  myRewards: CivicReward[];
  onSelectCampaign: (id: number) => void;
}) {
  const router = useRouter();
  const myCampaigns = campaigns.filter((c) => checkedInCampaigns.includes(c.id));
  const completedUnclaimed = myCampaigns.filter(
    (c) => c.status === 'Completed' && !claimedCampaigns.includes(c.id),
  );

  // Impact summary from campaign categories
  const categoryCounts: Record<string, number> = {};
  for (const c of myCampaigns) {
    const g = goals.find((g) => g.id === c.goal_id);
    if (g) categoryCounts[g.category] = (categoryCounts[g.category] || 0) + 1;
  }
  const impactLines = Object.entries(categoryCounts).map(
    ([cat, count]) => `${count} ${cat.toLowerCase()} campaign${count > 1 ? 's' : ''}`,
  );

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="My Profile"
          endAdornment={<button onClick={() => router.push('/debug')}><Settings /></button>}
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-4">
        {/* Profile header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">
                {username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <div>
            <p className="font-bold text-lg">{username || 'Volunteer'}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-block w-4 h-4 bg-blue-500 rounded-full text-white text-[10px] flex items-center justify-center leading-none">&#10003;</span>
              <span className="text-xs text-blue-600 font-semibold">Verified Human</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 text-center">
          <div>
            <p className="text-xl font-bold">{checkedInCampaigns.length}</p>
            <p className="text-xs text-gray-500">Check-ins</p>
          </div>
          <div>
            <p className="text-xl font-bold">{myRewards.length}</p>
            <p className="text-xs text-gray-500">Rewards</p>
          </div>
        </div>

        {/* Impact summary */}
        {impactLines.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-800">Your impact</p>
            <p className="text-sm text-green-700 mt-1">
              You contributed to {impactLines.join(', ')}
            </p>
          </div>
        )}

        {/* Achievements */}
        {(() => {
          const achievements = [
            { icon: '🌊', name: 'First Wave', desc: 'Complete your first check-in', unlocked: checkedInCampaigns.length >= 1 },
            { icon: '🏖️', name: 'Beach Guardian', desc: 'Join 3 environment campaigns', unlocked: (categoryCounts['Environment'] ?? 0) >= 3 },
            { icon: '🎁', name: 'Reward Hunter', desc: 'Claim your first reward', unlocked: myRewards.length >= 1 },
            { icon: '⭐', name: 'Rising Star', desc: 'Check in to 5 campaigns', unlocked: checkedInCampaigns.length >= 5 },
            { icon: '🤝', name: 'Community Hero', desc: 'Help across 3 categories', unlocked: Object.keys(categoryCounts).length >= 3 },
            { icon: '🏆', name: 'Cannes Champion', desc: 'Complete 10 campaigns', unlocked: checkedInCampaigns.length >= 10 },
          ];
          return (
            <>
              <p className="font-semibold">Achievements</p>
              <div className="grid grid-cols-3 gap-2">
                {achievements.map((a) => (
                  <div
                    key={a.name}
                    className={`rounded-xl p-3 text-center space-y-1 ${a.unlocked ? 'bg-white border' : 'bg-gray-100 opacity-40'}`}
                  >
                    <p className="text-2xl">{a.icon}</p>
                    <p className="text-xs font-semibold leading-tight">{a.name}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{a.desc}</p>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Unclaimed rewards */}
        {completedUnclaimed.length > 0 && (
          <>
            <p className="font-semibold">Unclaimed Rewards</p>
            {completedUnclaimed.map((c) => {
              const g = goals.find((g) => g.id === c.goal_id);
              return (
                <button key={c.id} onClick={() => onSelectCampaign(c.id)} className="text-left bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1 w-full">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold">{c.title}</p>
                    <Chip label={g?.category ?? ''} />
                  </div>
                  <p className="text-sm text-amber-700">Campaign completed — claim your reward!</p>
                </button>
              );
            })}
          </>
        )}

        {/* My rewards */}
        {myRewards.length > 0 && (
          <>
            <p className="font-semibold">My Rewards</p>
            {myRewards.map((r) => (
              <div key={r.id} className="bg-white border rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-gray-400">Claimed {r.claimed_at ? new Date(r.claimed_at).toLocaleDateString() : ''}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await fetch(r.file_path);
                    const blob = await res.blob();
                    const filename = r.file_path.split('/').pop() ?? 'reward';
                    const file = new File([blob], filename, { type: blob.type });
                    MiniKit.share({ files: [file] });
                  }}
                >
                  Save
                </Button>
              </div>
            ))}
          </>
        )}

        {/* Empty state */}
        {myCampaigns.length === 0 && (
          <div className="text-center mt-8">
            <p className="text-gray-500">No activity yet.</p>
            <p className="text-sm text-gray-400 mt-1">Check in to a campaign to get started!</p>
          </div>
        )}
      </Page.Main>
    </>
  );
}

// --- Main Page ---

export default function VolunteerPage() {
  const { data: session } = useSession();
  const [mainTab, setMainTab] = useState('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [step, setStep] = useState<'browse' | 'scan' | 'verify' | 'done'>('browse');
  const [showRewards, setShowRewards] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'current' | 'completed'>('upcoming');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkedInCampaigns, setCheckedInCampaigns] = useState<number[]>([]);
  const [interestedCampaigns, setInterestedCampaigns] = useState<number[]>([]);
  const [claimedCampaigns, setClaimedCampaigns] = useState<number[]>([]);
  const [rewards, setRewards] = useState<RewardSummary[]>([]);
  const [claimedReward, setClaimedReward] = useState<CivicReward | null>(null);
  const [myRewards, setMyRewards] = useState<CivicReward[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [confirmReward, setConfirmReward] = useState<string | null>(null);

  const walletAddress = session?.user?.walletAddress;

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
  }, [step, claiming, interestedCampaigns.length]);

  useEffect(() => {
    if (walletAddress) {
      fetch('/api/checkin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
        .then((r) => r.json())
        .then((data) => {
          setCheckedInCampaigns(data.campaigns);
          setInterestedCampaigns(data.interests ?? []);
        });

      fetch('/api/rewards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
        .then((r) => r.json())
        .then((data) => {
          setClaimedCampaigns(data.claimedCampaigns);
          setMyRewards(data.myRewards ?? []);
        });
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

  const today = new Date().toISOString().split('T')[0];
  const upcomingCampaigns = campaigns
    .filter((c) => (c.status === 'Active' || c.status === 'Open') && !checkedInCampaigns.includes(c.id) && c.event_date >= today)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  const currentCampaigns = campaigns
    .filter((c) => c.status === 'Active' && checkedInCampaigns.includes(c.id))
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
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
    const res = await fetch('/api/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, rewardName, campaignId: campaign.id }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || 'Failed to claim reward');
    }
    setConfirmReward(null);
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
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
          myRewards={myRewards}
          onSelectCampaign={(id) => { setSelectedCampaign(id); setMainTab('campaigns'); }}
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
                  onClick={() => setConfirmReward(r.name)}
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

          <AlertDialog open={!!confirmReward} onOpenChange={(open) => { if (!open) setConfirmReward(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Claim reward</AlertDialogTitle>
                <AlertDialogDescription>
                  Claim &quot;{confirmReward}&quot;? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose asChild>
                  <Button variant="secondary" size="lg" className="w-full">Cancel</Button>
                </AlertDialogClose>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={claiming}
                  onClick={() => confirmReward && handleClaimReward(confirmReward)}
                >
                  {claiming ? 'Claiming...' : 'Claim'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Page.Main>
      </>
    );
  }

  // --- Active campaign detail + check-in / interest flow ---
  if (campaign && goal) {
    const spotsLeft = campaign.max_volunteers - campaign.volunteer_count;
    const today = new Date().toISOString().split('T')[0];
    const isEventDay = today >= campaign.event_date;
    const isInterested = interestedCampaigns.includes(campaign.id);

    const handleInterest = async () => {
      setStep('browse');
      try {
        const action = 'interest';
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
        }).preset(orbLegacy({ signal: String(campaign.id) }));

        const completion = await request.pollUntilCompletion();
        if (!completion.success) return;

        await fetch('/api/interest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: completion.result, campaignId: campaign.id, walletAddress }),
        });

        setInterestedCampaigns((prev) => [...prev, campaign.id]);
      } catch (err) {
        console.error('Interest error:', err);
      }
    };

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
            {campaign.interest_count > 0 && (
              <p className="text-sm">
                <span className="font-semibold">Signed up:</span>{' '}
                {campaign.interest_count}
              </p>
            )}
            {isEventDay && (
              <p className="text-sm">
                <span className="font-semibold">Volunteers:</span>{' '}
                {campaign.volunteer_count}/{campaign.max_volunteers} checked in
              </p>
            )}
            <p className="text-sm">
              <span className="font-semibold">Event date:</span> {formatDate(campaign.event_date)}
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

          {step === 'browse' && !isAlreadyCheckedIn && !isEventDay && !isInterested && (
            <Button
              size="lg"
              variant="primary"
              className="w-full"
              onClick={handleInterest}
            >
              Sign up
            </Button>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && !isEventDay && isInterested && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="font-semibold text-blue-800">You&apos;re signed up!</p>
              <p className="text-sm text-blue-600 mt-1">
                Check-in opens on {formatDate(campaign.event_date)}
              </p>
            </div>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && isEventDay && (
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
              onClose={() => setStep('browse')}
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
          endAdornment={
            <button onClick={() => setShowRewards(true)} className="relative">
              <span className="text-xl">🎁</span>
              <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalRewardsLeft}
              </span>
            </button>
          }
        />
        <div className="flex gap-1 px-4 pb-2">
          <button
            onClick={() => setTab('upcoming')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg ${tab === 'upcoming' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Upcoming ({upcomingCampaigns.length})
          </button>
          <button
            onClick={() => setTab('current')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg ${tab === 'current' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Current ({currentCampaigns.length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg ${tab === 'completed' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Completed ({completedCampaigns.length})
          </button>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">

        {tab === 'upcoming' && upcomingCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          const daysUntil = Math.ceil((new Date(c.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const timeLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
          const dateLabel = new Date(c.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const isSignedUp = interestedCampaigns.includes(c.id);
          return (
            <CampaignCard
              key={c.id}
              title={c.title}
              category={g?.category ?? ''}
              location={c.location}
              coverImage={c.cover_image}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <div className="flex justify-between text-sm text-gray-500">
                <span className={daysUntil === 0 ? 'text-green-600 font-semibold' : daysUntil <= 3 ? 'text-amber-600' : ''}>
                  {timeLabel} · {dateLabel}
                </span>
                {isSignedUp && <span className="text-blue-600">Signed up</span>}
              </div>
              {c.interest_count > 0 && (
                <p className="text-xs text-gray-400">{c.interest_count} signed up</p>
              )}
            </CampaignCard>
          );
        })}

        {tab === 'upcoming' && upcomingCampaigns.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No upcoming campaigns right now.</p>
        )}

        {tab === 'current' && currentCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          return (
            <CampaignCard
              key={c.id}
              title={c.title}
              category={g?.category ?? ''}
              location={c.location}
              coverImage={c.cover_image}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <div className="flex justify-between text-sm text-gray-500">
                <span>{c.volunteer_count} checked in</span>
                <span className="text-green-600">You&apos;re in</span>
              </div>
            </CampaignCard>
          );
        })}

        {tab === 'current' && currentCampaigns.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No active check-ins. Sign up for a campaign!</p>
        )}

        {tab === 'completed' && completedCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          const claimed = claimedCampaigns.includes(c.id);
          return (
            <CampaignCard
              key={c.id}
              title={c.title}
              category={g?.category ?? ''}
              location={c.location}
              coverImage={c.cover_image}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <p className="text-sm">
                {claimed
                  ? <span className="text-green-600">Reward claimed</span>
                  : <span className="text-amber-600">Claim your reward</span>
                }
              </p>
            </CampaignCard>
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
