import { addCampaignPhoto, getCampaign, getCheckInCount, updateCampaignStatus } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const campaignId = Number(formData.get('campaignId'));

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.status !== 'Active') return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 });

  const volunteerCount = getCheckInCount(campaignId);
  if (volunteerCount < campaign.min_volunteers) {
    return NextResponse.json({ error: `Need at least ${campaign.min_volunteers} volunteers, have ${volunteerCount}` }, { status: 400 });
  }

  // Save uploaded photos
  const photos = formData.getAll('photos') as File[];
  for (const photo of photos) {
    if (photo.size === 0) continue;
    const bytes = await photo.arrayBuffer();
    const filename = `${campaignId}-${Date.now()}-${photo.name}`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
    await writeFile(filePath, Buffer.from(bytes));
    addCampaignPhoto(campaignId, `/uploads/${filename}`);
  }

  updateCampaignStatus(campaignId, 'PendingReview');
  return NextResponse.json({ success: true });
}
