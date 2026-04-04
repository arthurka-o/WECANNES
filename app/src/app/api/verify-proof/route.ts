import { hasCheckedIn, recordCheckIn, setUserNullifier } from '@/lib/db';
import { checkInOnChain } from '@/lib/contract';
import { NextRequest, NextResponse } from 'next/server';
import { decodeAbiParameters } from 'viem';

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

  // Submit v3 proof on-chain if available
  let txHash: string | null = null;
  const v3Response = payload?.responses?.find(
    (r: { merkle_root?: string }) => r.merkle_root,
  );

  if (v3Response && campaignId != null) {
    try {
      const root = BigInt(v3Response.merkle_root);
      const nullifierHash = BigInt(v3Response.nullifier);
      const [unpackedProof] = decodeAbiParameters(
        [{ type: 'uint256[8]' }],
        v3Response.proof as `0x${string}`,
      );

      const result = await checkInOnChain(
        BigInt(campaignId),
        root,
        nullifierHash,
        unpackedProof,
      );
      txHash = result.hash;
    } catch (err) {
      console.error('On-chain check-in failed:', err);
      // Don't fail the request — off-chain check-in already succeeded
    }
  }

  return NextResponse.json({ verifyRes, txHash });
}
