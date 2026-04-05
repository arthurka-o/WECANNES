import { createCampaign, getCampaign, getCampaigns } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

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

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const data = {
      goal_id: Number(formData.get('goal_id')),
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      ngo: formData.get('ngo') as string,
      ngo_contact: (formData.get('ngo_contact') as string) || undefined,
      funding_required: Number(formData.get('funding_required')),
      min_volunteers: Number(formData.get('min_volunteers')),
      max_volunteers: Number(formData.get('max_volunteers')),
      event_date: formData.get('event_date') as string,
      location: formData.get('location') as string,
      cover_image: undefined as string | undefined,
    };

    const photo = formData.get('cover_image') as File | null;
    if (photo && photo.size > 0) {
      const bytes = await photo.arrayBuffer();
      const filename = `cover-${Date.now()}-${photo.name}`;
      const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
      await writeFile(filePath, Buffer.from(bytes));
      data.cover_image = `/uploads/${filename}`;
    }

    const id = createCampaign(data);
    return NextResponse.json({ id }, { status: 201 });
  }

  const data = await req.json();
  const id = createCampaign(data);
  return NextResponse.json({ id }, { status: 201 });
}
