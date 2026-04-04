import { claimReward, getClaimForCampaign, getClaimedCampaigns, getNullifierByWallet, getRewards } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET — list all rewards + remaining counts
export async function GET() {
  const rewards = getRewards();
  return NextResponse.json({ rewards });
}

// POST — claim a reward
export async function POST(req: NextRequest) {
  const { walletAddress, rewardId, campaignId } = await req.json();

  const nullifier = getNullifierByWallet(walletAddress);
  if (!nullifier) {
    return NextResponse.json({ success: false, error: 'Not verified' }, { status: 400 });
  }

  const result = claimReward(nullifier, rewardId, campaignId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

// PUT — check claim status for a wallet
export async function PUT(req: NextRequest) {
  const { walletAddress, campaignId } = await req.json();

  const nullifier = getNullifierByWallet(walletAddress);
  if (!nullifier) {
    return NextResponse.json({ claimedCampaigns: [], claimedReward: null });
  }

  const claimedCampaigns = getClaimedCampaigns(nullifier);
  const claimedReward = campaignId != null ? getClaimForCampaign(nullifier, campaignId) : null;

  return NextResponse.json({ claimedCampaigns, claimedReward });
}
