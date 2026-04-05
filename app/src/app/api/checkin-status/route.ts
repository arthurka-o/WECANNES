import { getCheckedInCampaigns, getInterestedCampaigns, getNullifierByWallet } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { walletAddress } = await req.json();
  if (!walletAddress) {
    return NextResponse.json({ campaigns: [], interests: [] });
  }
  const nullifier = getNullifierByWallet(walletAddress);
  if (!nullifier) {
    return NextResponse.json({ campaigns: [], interests: [] });
  }
  const campaigns = getCheckedInCampaigns(nullifier);
  const interests = getInterestedCampaigns(nullifier);
  return NextResponse.json({ campaigns, interests });
}
