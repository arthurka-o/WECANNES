import { setCheckinToken, validateCheckinToken } from '@/lib/db';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// NGO calls this to generate a QR token for their campaign
export async function POST(req: NextRequest) {
  const { campaignId } = await req.json();
  const token = crypto.randomBytes(8).toString('hex');
  setCheckinToken(campaignId, token);
  return NextResponse.json({ campaignId, token });
}

// Volunteer calls this to validate a scanned QR token
export async function PUT(req: NextRequest) {
  const { campaignId, token } = await req.json();
  const valid = validateCheckinToken(campaignId, token);
  return NextResponse.json({ valid });
}
