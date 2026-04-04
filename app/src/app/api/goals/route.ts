import { createGoal, getGoals } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(getGoals());
}

export async function POST(req: NextRequest) {
  const { title, category, description } = await req.json();
  const id = createGoal(title, category, description);
  return NextResponse.json({ id }, { status: 201 });
}
