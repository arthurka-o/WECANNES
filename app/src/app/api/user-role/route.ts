import { getUserRole, setUserRole } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const walletAddress = req.nextUrl.searchParams.get('wallet');
  if (!walletAddress) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  const role = getUserRole(walletAddress);
  return NextResponse.json({ role });
}

export async function POST(req: NextRequest) {
  const { walletAddress, role } = await req.json();
  if (!walletAddress || !role) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  setUserRole(walletAddress, role);
  return NextResponse.json({ success: true });
}
