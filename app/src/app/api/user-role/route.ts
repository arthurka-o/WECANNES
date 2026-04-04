import { getUserProfile, setUserRole } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const walletAddress = req.nextUrl.searchParams.get('wallet');
  if (!walletAddress) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  const profile = getUserProfile(walletAddress);
  return NextResponse.json({ role: profile?.role ?? null, name: profile?.name ?? null, email: profile?.email ?? null });
}

export async function POST(req: NextRequest) {
  const { walletAddress, role, name, email } = await req.json();
  if (!walletAddress || !role) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  setUserRole(walletAddress, role, name, email);
  return NextResponse.json({ success: true });
}
