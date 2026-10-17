import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { calculateOnboardingStatus } from '@/lib/laurem-onboarding';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Onboarding token is required.' }, { status: 400 });
  try {
    const client = db();
    const { data: packageRow, error } = await client.from('laurem_staff_onboarding_packages').select('id,staff_id,audience,title,status,access_token_expires_at').eq('access_token_hash', hashToken(token)).maybeSingle();
    if (error) throw error;
    if (!packageRow) return NextResponse.json({ error: 'Onboarding link not found.' }, { status: 404 });
    if (packageRow.access_token_expires_at && new Date(packageRow.access_token_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This onboarding link has expired.' }, { status: 410 });
    const { data: staff } = await client.from('staff_profiles').select('full_name,job_title,employee_number,start_date,location,employment_status').eq('id', packageRow.staff_id).maybeSingle();
    const { data: tasks, error: taskError } = await client.from('laurem_staff_onboarding_tasks').select('id,category,title,description,required,status,acknowledgement_required,acknowledged_at,document_path,sort_order').eq('package_id', packageRow.id).order('sort_order', { ascending: true });
    if (taskError) throw taskError;
    return NextResponse.json({ package: packageRow, staff, tasks: tasks || [] });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding.public_load_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load onboarding package.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Onboarding token is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!taskId || action !== 'acknowledge' || !name) return NextResponse.json({ error: 'Task, acknowledgement action and full name are required.' }, { status: 400 });
  try {
    const client = db();
    const now = new Date().toISOString();
    const { data: packageRow, error: packageError } = await client.from('laurem_staff_onboarding_packages').select('id,staff_id,audience,status,access_token_expires_at').eq('access_token_hash', hashToken(token)).maybeSingle();
    if (packageError) throw packageError;
    if (!packageRow) return NextResponse.json({ error: 'Onboarding link not found.' }, { status: 404 });
    if (packageRow.access_token_expires_at && new Date(packageRow.access_token_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This onboarding link has expired.' }, { status: 410 });
    const { data: task, error: taskError } = await client.from('laurem_staff_onboarding_tasks').select('id,package_id,status,acknowledgement_required').eq('id', taskId).eq('package_id', packageRow.id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: 'Onboarding task not found.' }, { status: 404 });
    if (!task.acknowledgement_required) return NextResponse.json({ error: 'This task does not require employee acknowledgement.' }, { status: 400 });

    const { data: updatedTask, error: updateError } = await client.from('laurem_staff_onboarding_tasks').update({ status: 'completed', acknowledged_at: now, acknowledged_by: name, completed_at: now, completed_by: name, updated_at: now }).eq('id', taskId).select('*').single();
    if (updateError) throw updateError;

    const { data: tasks } = await client.from('laurem_staff_onboarding_tasks').select('status,required').eq('package_id', packageRow.id);
    const status = calculateOnboardingStatus((tasks || []) as Array<{ status: string; required: boolean }>);
    const { data: updatedPackage, error: updatePackageError } = await client.from('laurem_staff_onboarding_packages').update({ status, completed_at: status === 'complete' ? now : null, updated_at: now }).eq('id', packageRow.id).select('id,staff_id,audience,title,status,completed_at').single();
    if (updatePackageError) throw updatePackageError;

    return NextResponse.json({
      task: updatedTask,
      package: updatedPackage,
      staffActivated: false,
      staffReadyForHire: status === 'complete',
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding.public_acknowledge_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to record acknowledgement.' }, { status: 500 });
  }
}
