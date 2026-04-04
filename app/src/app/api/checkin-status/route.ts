import { getCheckedInCampaigns, getNullifierByWallet } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { walletAddress } = await req.json();
  if (!walletAddress) {
    return NextResponse.json({ campaigns: [] });
  }
  const nullifier = getNullifierByWallet(walletAddress);
  if (!nullifier) {
    return NextResponse.json({ campaigns: [] });
  }
  const campaigns = getCheckedInCampaigns(nullifier);
  return NextResponse.json({ campaigns });
}
