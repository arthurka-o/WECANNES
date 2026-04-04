import { getCampaignPhotos } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const campaignId = Number(req.nextUrl.searchParams.get('campaignId'));
  return NextResponse.json(getCampaignPhotos(campaignId));
}
