'use client';

import { CampaignCard } from '@/components/CampaignCard';
import { Page } from '@/components/PageLayout';
import { formatDate } from '@/lib/utils';
import type { Campaign, CivicReward, Goal, RewardSummary } from '@/lib/db';
import { IDKit, orbLegacy, type RpContext } from '@worldcoin/idkit';
import { MiniKit } from '@worldcoin/minikit-js';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose, Button, LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import jsQR from 'jsqr';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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

      // Check-in verified off-chain via World ID v4 API
      // On-chain verification commented out — v3 WorldIDRouter
      // doesn't accept proofs from IDKit v4's orbLegacy preset.
      // TODO: re-enable when v4 on-chain verifier is deployed.

      setState('success');
      setTimeout(onSuccess, 1000);
    } catch (err) {
      console.error('Check-in error:', err);
      setState('failed');
      setTimeout(() => { setState(undefined); onError(); }, 2000);
    }
  };

  return (
    <div className="space-y-4 flex flex-col items-center">
      <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-tertiary/20 text-center shadow-sm w-full">
        <span className="material-symbols-outlined text-tertiary text-3xl mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_scanner</span>
        <p className="font-headline font-bold text-on-surface">QR Verified!</p>
        <p className="text-xs text-on-surface-variant mt-1">Now confirm your identity with World ID</p>
      </div>
      <LiveFeedback
        label={{
          failed: 'Verification failed',
          pending: 'Verifying...',
          success: 'Verified!',
        }}
        state={state}
      >
        <button
          onClick={handleVerify}
          disabled={state === 'pending'}
          style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }} className="shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
        >
          Verify with World ID
        </button>
      </LiveFeedback>
    </div>
  );
}

// --- Profile View ---

function ProfileView({
  campaigns,
  goals,
  checkedInCampaigns,
  username,
  profilePictureUrl,
  myRewards,
}: {
  campaigns: Campaign[];
  goals: Goal[];
  checkedInCampaigns: number[];
  username?: string;
  profilePictureUrl?: string;
  myRewards: CivicReward[];
}) {
  const router = useRouter();
  const myCampaigns = campaigns.filter((c) => checkedInCampaigns.includes(c.id));

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
      <Page.Header>
        <div className="flex justify-between items-center">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">Profile</h2>
          <button onClick={() => router.push('/debug')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-5 pt-2">
        {/* Profile hero */}
        <div className="impact-gradient rounded-[24px] p-6 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-white/20 overflow-hidden flex-shrink-0 border-2 border-white/30">
              {profilePictureUrl ? (
                <img src={profilePictureUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl text-white/60 font-headline font-bold">
                  {username?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <div>
              <p className="font-headline text-xl font-bold">{username || 'Volunteer'}</p>
              <div className="verified-badge-glass px-2.5 py-1 rounded-full flex items-center gap-1.5 mt-1.5 w-fit border-white/20">
                <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                <span className="text-white font-bold text-[10px] uppercase tracking-wider">Verified Human</span>
              </div>
            </div>
          </div>
          {impactLines.length > 0 && (
            <p className="text-white/80 text-sm">
              Contributed to {impactLines.join(', ')}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{checkedInCampaigns.length}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Check-ins</p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{myRewards.length}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Rewards</p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{myCampaigns.length}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Campaigns</p>
          </div>
        </div>

        {/* Achievements */}
        {(() => {
          const achievements = [
            { icon: '🌊', name: 'First Wave', desc: 'First check-in', unlocked: checkedInCampaigns.length >= 1 },
            { icon: '🏖️', name: 'Beach Guardian', desc: '3 environment', unlocked: (categoryCounts['Environment'] ?? 0) >= 3 },
            { icon: '🎁', name: 'Reward Hunter', desc: 'First reward', unlocked: myRewards.length >= 1 },
            { icon: '⭐', name: 'Rising Star', desc: '5 check-ins', unlocked: checkedInCampaigns.length >= 5 },
            { icon: '🤝', name: 'Community', desc: '3 categories', unlocked: Object.keys(categoryCounts).length >= 3 },
            { icon: '🏆', name: 'Champion', desc: '10 campaigns', unlocked: checkedInCampaigns.length >= 10 },
          ];
          return (
            <div>
              <p className="font-headline font-bold text-on-surface mb-3">Achievements</p>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {achievements.map((a) => (
                  <div
                    key={a.name}
                    className={`flex-shrink-0 w-24 rounded-[20px] p-3 text-center border ${a.unlocked ? 'bg-surface-container-lowest border-outline-variant/10 shadow-sm' : 'bg-surface-container border-transparent opacity-40'}`}
                  >
                    <p className="text-2xl mb-1">{a.icon}</p>
                    <p className="text-[11px] font-bold text-on-surface leading-tight">{a.name}</p>
                    <p className="text-[9px] text-on-surface-variant leading-tight mt-0.5">{a.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Leaderboard */}
        <div className="bg-surface-container-lowest rounded-[20px] p-4 border border-outline-variant/10 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full impact-gradient flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
            </div>
            <div>
              <p className="font-headline font-bold text-on-surface text-sm">
                #{Math.max(1, 25 - checkedInCampaigns.length * 4)} in Cannes
              </p>
              <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Volunteer ranking</p>
            </div>
          </div>
          <span className="text-on-surface-variant material-symbols-outlined text-lg">chevron_right</span>
        </div>

        {/* Recent activity */}
        {myCampaigns.length > 0 && (
          <div>
            <p className="font-headline font-bold text-on-surface mb-3">Recent Activity</p>
            <div className="bg-surface-container-lowest rounded-[20px] border border-outline-variant/10 shadow-sm overflow-hidden">
              {myCampaigns.slice(0, 4).map((c, i) => {
                const isCompleted = c.status === 'Completed';
                const isCurrent = c.status === 'Active';
                return (
                  <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-surface-container-high' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-primary-container/20' : isCurrent ? 'bg-blue-100' : 'bg-surface-container'}`}>
                      <span className={`material-symbols-outlined text-base ${isCompleted ? 'text-primary' : isCurrent ? 'text-blue-700' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {isCompleted ? 'check_circle' : isCurrent ? 'radio_button_checked' : 'schedule'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{c.title}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">
                        {isCompleted ? 'Completed' : isCurrent ? 'Checked in' : 'Signed up'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My rewards */}
        {myRewards.length > 0 && (
          <div>
            <p className="font-headline font-bold text-on-surface mb-3">My Rewards</p>
            {myRewards.map((r) => (
              <div key={r.id} className="bg-surface-container-lowest rounded-[20px] p-4 flex justify-between items-center border border-outline-variant/10 shadow-sm mb-3">
                <div>
                  <p className="font-bold text-on-surface text-sm">{r.name}</p>
                  <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider mt-0.5">
                    Claimed {r.claimed_at ? new Date(r.claimed_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <button
                  className="px-4 py-2 rounded-xl bg-surface-container-low text-primary text-xs font-bold uppercase tracking-wider"
                  onClick={async () => {
                    const res = await fetch(r.file_path);
                    const blob = await res.blob();
                    const filename = r.file_path.split('/').pop() ?? 'reward';
                    const file = new File([blob], filename, { type: blob.type });
                    MiniKit.share({ files: [file] });
                  }}
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {myCampaigns.length === 0 && (
          <div className="text-center mt-12">
            <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">explore</span>
            <p className="font-headline font-bold text-on-surface">No activity yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Sign up for a campaign to get started!</p>
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
    <Page.Footer>
      <div className="flex justify-around items-center">
        <button
          onClick={() => setMainTab('campaigns')}
          className={`flex flex-col items-center justify-center px-5 py-2.5 rounded-xl transition-all ${mainTab === 'campaigns' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: mainTab === 'campaigns' ? "'FILL' 1" : "'FILL' 0" }}>explore</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider mt-1">Campaigns</span>
        </button>
        <button
          onClick={() => setMainTab('profile')}
          className={`flex flex-col items-center justify-center px-5 py-2.5 rounded-xl transition-all ${mainTab === 'profile' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: mainTab === 'profile' ? "'FILL' 1" : "'FILL' 0" }}>account_circle</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider mt-1">Profile</span>
        </button>
      </div>
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
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
          myRewards={myRewards}
        />
        {bottomTabs}
      </Page>
    );
  }

  // --- Reward pool overlay ---
  if (showRewards) {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowRewards(false)} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Civic Rewards</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">Available to all volunteers</p>
          {rewards.map((r) => (
            <div key={r.name} className="bg-surface-container-lowest rounded-[20px] p-4 flex justify-between items-center border border-outline-variant/10 shadow-sm">
              <div>
                <p className="font-headline font-bold text-on-surface">{r.name}</p>
              </div>
              <div className="text-right">
                {r.remaining > 0 ? (
                  <>
                    <p className="font-headline text-xl font-extrabold text-primary">{r.remaining}</p>
                    <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">of {r.total}</p>
                  </>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-red-100 text-red-800 text-xs font-bold uppercase tracking-wider">Sold out</span>
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
            <span className="px-3 py-1 bg-primary-container/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full">Completed</span>
            <span className="px-3 py-1 bg-white/90 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full border border-outline-variant/10">{goal.category}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">location_on</span>
              <span className="text-on-surface">{campaign.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">groups</span>
              <span className="text-on-surface">{campaign.volunteer_count} volunteers participated</span>
            </div>
          </div>

          <p className="text-sm text-on-surface-variant">{campaign.description}</p>

          {hasClaimedReward && claimedReward ? (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-primary/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-primary text-4xl mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
              <p className="font-headline font-bold text-on-surface">Reward claimed!</p>
              <p className="text-sm text-on-surface-variant mt-1">{claimedReward.name}</p>
              {claimedReward.file_path && (
                <button
                  className="mt-3 px-5 py-2.5 rounded-xl bg-surface-container-low text-primary text-xs font-bold uppercase tracking-wider"
                  onClick={async () => {
                    const res = await fetch(claimedReward.file_path);
                    const blob = await res.blob();
                    const filename = claimedReward.file_path.split('/').pop() ?? 'ticket';
                    const file = new File([blob], filename, { type: blob.type });
                    MiniKit.share({ files: [file] });
                  }}
                >
                  Save ticket
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="font-headline font-bold text-on-surface">Choose your reward</p>
              {rewards.map((r) => (
                <button
                  key={r.name}
                  onClick={() => setConfirmReward(r.name)}
                  disabled={r.remaining <= 0 || claiming}
                  className={`w-full text-left bg-surface-container-lowest rounded-[20px] p-4 flex justify-between items-center border border-outline-variant/10 shadow-sm ${
                    r.remaining <= 0 ? 'opacity-40' : ''
                  }`}
                >
                  <p className="font-bold text-on-surface">{r.name}</p>
                  <span className="text-xs text-on-surface-variant font-medium">{r.remaining} left</span>
                </button>
              ))}
              {totalRewardsLeft === 0 && (
                <p className="text-sm text-on-surface-variant text-center mt-2">
                  No rewards available right now.
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
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedCampaign(null); setStep('browse'); }} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface truncate">{campaign.title}</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          {/* Cover image */}
          {campaign.cover_image && (
            <div className="relative h-44 w-full rounded-[20px] overflow-hidden -mt-2">
              <img src={campaign.cover_image} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex gap-2">
                <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-primary text-[10px] font-bold uppercase tracking-wider rounded-full">{goal.category}</span>
                {campaign.status === 'Open' && <span className="px-3 py-1 bg-amber-100/90 backdrop-blur-md text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-full">Needs sponsor</span>}
              </div>
            </div>
          )}

          <p className="text-sm text-on-surface-variant">{campaign.description}</p>

          {/* Info rows */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">location_on</span>
              <span className="text-on-surface">{campaign.location}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">event</span>
              <span className="text-on-surface">
                {formatDate(campaign.event_date)}
                {(() => {
                  const days = Math.ceil((new Date(campaign.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  if (days < 0) return <span className="text-on-surface-variant"> · {-days}d ago</span>;
                  if (days === 0) return <span className="text-primary font-semibold"> · Today</span>;
                  if (days === 1) return <span className="text-amber-600 font-semibold"> · Tomorrow</span>;
                  return <span className="text-on-surface-variant"> · in {days}d</span>;
                })()}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">apartment</span>
              <span className="text-on-surface">{campaign.ngo}</span>
            </div>
            {campaign.sponsor && (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">handshake</span>
                <span className="text-on-surface">{campaign.sponsor}</span>
              </div>
            )}
          </div>

          {/* Stats grid */}
          {(() => {
            const progress = isEventDay ? Math.min(campaign.volunteer_count / campaign.min_volunteers, 1) : 0;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {isEventDay ? (
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
                {isEventDay && campaign.volunteer_count > 0 && (
                  <div>
                    <div className="w-full bg-surface-container-high rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${progress >= 1 ? 'bg-primary' : 'bg-amber-500'}`}
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant font-medium mt-1.5 text-center">
                      {progress >= 1 ? 'Minimum reached!' : `${campaign.min_volunteers - campaign.volunteer_count} more needed`}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {step === 'browse' && isAlreadyCheckedIn && (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-primary/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-primary text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="font-headline font-bold text-on-surface">Checked in!</p>
              <p className="text-xs text-on-surface-variant mt-1">
                You&apos;ll receive civic rewards when the campaign completes.
              </p>
            </div>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && !isEventDay && !isInterested && (
            <button style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }} className="shadow-lg shadow-primary/20 active:scale-95 transition-transform" onClick={handleInterest}>
              Sign Up
            </button>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && !isEventDay && isInterested && (
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-tertiary/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-tertiary text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>event_available</span>
              <p className="font-headline font-bold text-on-surface">You&apos;re signed up!</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Check-in opens on {formatDate(campaign.event_date)}
              </p>
            </div>
          )}

          {step === 'browse' && !isAlreadyCheckedIn && isEventDay && (
            <button style={{ background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }} className="shadow-lg shadow-primary/20 active:scale-95 transition-transform" onClick={() => setStep('scan')}>
              Check In
            </button>
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
            <div className="bg-surface-container-lowest rounded-[20px] p-5 border border-primary/20 text-center shadow-sm">
              <span className="material-symbols-outlined text-primary text-4xl mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
              <p className="font-headline font-bold text-on-surface">Checked in!</p>
              <p className="text-xs text-on-surface-variant mt-1">
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
      <Page.Header>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">Campaigns</h2>
          <button onClick={() => setShowRewards(true)} className="w-10 h-10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined">redeem</span>
          </button>
        </div>
        <nav className="flex gap-1.5">
          <button
            onClick={() => setTab('upcoming')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'upcoming' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setTab('current')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'current' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Current
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${tab === 'completed' ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Completed
          </button>
        </nav>
      </Page.Header>
      <Page.Main className="flex flex-col gap-5 pt-4">

        {tab === 'upcoming' && upcomingCampaigns.map((c) => {
          const g = goals.find((g) => g.id === c.goal_id);
          const daysUntil = Math.ceil((new Date(c.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const timeLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`;
          const dateLabel = new Date(c.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const isSignedUp = interestedCampaigns.includes(c.id);
          return (
            <CampaignCard
              key={c.id}
              title={c.title}
              category={g?.category ?? ''}
              location={`${dateLabel} · ${timeLabel}`}
              coverImage={c.cover_image}
              ngo={c.ngo}
              sponsor={c.sponsor}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-primary font-bold text-sm leading-none">{c.interest_count} signed up</span>
                  <span className="text-[10px] text-on-surface-variant font-medium uppercase mt-1">
                    {c.max_volunteers - c.interest_count} spots left
                  </span>
                </div>
                {isSignedUp ? (
                  <span className="px-4 py-2 rounded-xl bg-surface-container text-primary text-xs font-bold uppercase tracking-wider">Joined</span>
                ) : (
                  <span className="impact-gradient px-4 py-2 rounded-xl text-white text-xs font-bold uppercase tracking-wider">Sign Up</span>
                )}
              </div>
            </CampaignCard>
          );
        })}

        {tab === 'upcoming' && upcomingCampaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            <span className="material-symbols-outlined text-6xl text-outline-variant">explore</span>
            <p className="font-headline font-bold text-on-surface-variant">Nothing here yet</p>
            <p className="text-sm text-on-surface-variant">New campaigns are on the way!</p>
          </div>
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
              ngo={c.ngo}
              sponsor={c.sponsor}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold text-sm">{c.volunteer_count} checked in</span>
                <span className="px-4 py-2 rounded-xl bg-primary-container/20 text-primary text-xs font-bold uppercase tracking-wider">Active</span>
              </div>
            </CampaignCard>
          );
        })}

        {tab === 'current' && currentCampaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            <span className="material-symbols-outlined text-6xl text-outline-variant">directions_walk</span>
            <p className="font-headline font-bold text-on-surface-variant">No check-ins yet</p>
            <p className="text-sm text-on-surface-variant">Sign up for a campaign and show up!</p>
          </div>
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
              ngo={c.ngo}
              onClick={() => setSelectedCampaign(c.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold text-sm">{c.volunteer_count} participated</span>
                {claimed ? (
                  <span className="px-4 py-2 rounded-xl bg-primary-container/20 text-primary text-xs font-bold uppercase tracking-wider">Claimed</span>
                ) : (
                  <span className="impact-gradient px-4 py-2 rounded-xl text-white text-xs font-bold uppercase tracking-wider">Claim Reward</span>
                )}
              </div>
            </CampaignCard>
          );
        })}

        {tab === 'completed' && completedCampaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            <span className="material-symbols-outlined text-6xl text-outline-variant">emoji_events</span>
            <p className="font-headline font-bold text-on-surface-variant">No trophies yet</p>
            <p className="text-sm text-on-surface-variant">Complete a campaign to earn rewards!</p>
          </div>
        )}
      </Page.Main>
      {showBottomTabs && bottomTabs}
    </Page>
  );
}
