import { fundCampaign, getCampaign } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { campaignId, sponsor } = await req.json();

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.status !== 'Open') return NextResponse.json({ error: 'Campaign is not open' }, { status: 400 });

  fundCampaign(campaignId, sponsor);
  return NextResponse.json({ success: true });
}
