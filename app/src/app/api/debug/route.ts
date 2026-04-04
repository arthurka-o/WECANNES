import { getNullifierByWallet, recordCheckIn } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint: fake a check-in for testing
export async function POST(req: NextRequest) {
  const { walletAddress, campaignId } = await req.json();
  const nullifier = getNullifierByWallet(walletAddress);
  if (!nullifier) {
    return NextResponse.json({ error: 'No nullifier for this wallet' }, { status: 400 });
  }
  recordCheckIn(campaignId, nullifier);
  return NextResponse.json({ ok: true, campaignId, nullifier });
}
