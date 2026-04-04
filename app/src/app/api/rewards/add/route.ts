import { addRewards } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const name = formData.get('name') as string;
  const files = formData.getAll('files') as File[];

  const filePaths: string[] = [];
  for (const file of files) {
    if (file.size === 0) continue;
    const bytes = await file.arrayBuffer();
    const filename = `reward-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const dest = path.join(process.cwd(), 'public', 'uploads', filename);
    await writeFile(dest, Buffer.from(bytes));
    filePaths.push(`/uploads/${filename}`);
  }

  addRewards(name, filePaths);
  return NextResponse.json({ count: filePaths.length }, { status: 201 });
}
