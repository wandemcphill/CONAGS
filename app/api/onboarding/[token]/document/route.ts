import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const taskId = new URL(request.url).searchParams.get('taskId') || '';
  if (!token || !taskId) return NextResponse.json({ error: 'Onboarding token and task id are required.' }, { status: 400 });
  try {
    const client = db();
    const { data: packageRow, error: packageError } = await client.from('staff_onboarding_packages').select('id,access_token_expires_at').eq('access_token_hash', hashToken(token)).maybeSingle();
    if (packageError) throw packageError;
    if (!packageRow) return NextResponse.json({ error: 'Onboarding link not found.' }, { status: 404 });
    if (packageRow.access_token_expires_at && new Date(packageRow.access_token_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This onboarding link has expired.' }, { status: 410 });
    const { data: task, error: taskError } = await client.from('staff_onboarding_tasks').select('title,document_path').eq('id', taskId).eq('package_id', packageRow.id).maybeSingle();
    if (taskError) throw taskError;
    if (!task?.document_path) return NextResponse.json({ error: 'This onboarding item has no document attached.' }, { status: 404 });
    if (!task.document_path.startsWith('docs/handbooks/')) return NextResponse.json({ error: 'Document is not available through the onboarding portal.' }, { status: 400 });
    const content = await fs.readFile(path.join(process.cwd(), task.document_path), 'utf8');
    return NextResponse.json({ title: task.title, content });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding.document_load_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load onboarding document.' }, { status: 500 });
  }
}
