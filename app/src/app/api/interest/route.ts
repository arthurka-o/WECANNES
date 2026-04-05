import { hasExpressedInterest, recordInterest, setUserNullifier } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { payload, campaignId, walletAddress } = await req.json();
  const rp_id = process.env.RP_ID;

  // Verify with World ID v4 API
  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${rp_id}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const verifyRes = await response.json();

  if (!verifyRes.success) {
    return NextResponse.json({ verifyRes }, { status: 400 });
  }

  const nullifier = verifyRes.nullifier ?? verifyRes.results?.[0]?.nullifier;

  if (walletAddress && nullifier) {
    setUserNullifier(walletAddress, nullifier);
  }

  if (campaignId != null && nullifier) {
    if (hasExpressedInterest(campaignId, nullifier)) {
      return NextResponse.json(
        { verifyRes: { success: false, error: 'Already expressed interest' } },
        { status: 400 },
      );
    }
    recordInterest(campaignId, nullifier);
  }

  return NextResponse.json({ verifyRes });
}
