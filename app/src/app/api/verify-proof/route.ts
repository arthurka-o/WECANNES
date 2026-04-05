import { hasCheckedIn, recordCheckIn, setUserNullifier } from '@/lib/db';
import { writeFileSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { payload, campaignId, walletAddress } = await req.json();
  const rp_id = process.env.RP_ID;

  // Verify with World ID v4 API (off-chain verification)
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

  // Link wallet address to nullifier
  if (walletAddress && nullifier) {
    setUserNullifier(walletAddress, nullifier);
  }

  // Check for duplicate check-in on this campaign
  if (campaignId != null && nullifier) {
    if (hasCheckedIn(campaignId, nullifier)) {
      return NextResponse.json(
        { verifyRes: { success: false, error: 'Already checked in to this campaign' } },
        { status: 400 },
      );
    }
    recordCheckIn(campaignId, nullifier);
  }

  // Return the v3 proof fields so frontend can submit on-chain via MiniKit
  // Debug: write payload to file since console.log is swallowed in production
  try {
    writeFileSync('/tmp/verify-proof-debug.json', JSON.stringify({ payload, verifyRes }, null, 2));
  } catch {}


  const v3Response = payload?.responses?.find(
    (r: { merkle_root?: string }) => r.merkle_root,
  );

  console.log('v3Response found:', !!v3Response);
  if (v3Response) {
    console.log('merkle_root:', v3Response.merkle_root?.substring(0, 20) + '...');
    console.log('nullifier:', v3Response.nullifier?.substring(0, 20) + '...');
    console.log('proof length:', v3Response.proof?.length);
  }
  console.log('=========================');

  return NextResponse.json({
    verifyRes,
    v3Proof: v3Response ? {
      merkle_root: v3Response.merkle_root,
      nullifier: v3Response.nullifier,
      proof: v3Response.proof,
    } : null,
  });
}
