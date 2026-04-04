import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { payload } = await req.json();
  const rp_id = process.env.RP_ID;

  console.log('Verifying proof with v4 API, rp_id:', rp_id);
  console.log('Payload:', JSON.stringify(payload));

  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${rp_id}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const verifyRes = await response.json();
  console.log('World ID v4 verify response:', JSON.stringify(verifyRes));

  return NextResponse.json({ verifyRes }, { status: response.status });
}
