import { getCampaign, updateCampaignStatus } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { campaignId } = await req.json();

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.status !== 'PendingReview') return NextResponse.json({ error: 'Not pending review' }, { status: 400 });

  updateCampaignStatus(campaignId, 'Active');
  return NextResponse.json({ success: true });
}
