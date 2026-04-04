import { getCampaign, getCampaigns } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const campaign = getCampaign(Number(id));
    return campaign
      ? NextResponse.json(campaign)
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(getCampaigns());
}
