import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { calculateOnboardingStatus } from '@/lib/laurem-onboarding';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const staffId = new URL(request.url).searchParams.get('staffId');
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });
  try {
    const client = db();
    const { data: packageRow, error: packageError } = await client.from('staff_onboarding_packages').select('*').eq('staff_id', staffId).maybeSingle();
    if (packageError) throw packageError;
    if (!packageRow) return NextResponse.json({ package: null, tasks: [] });
    const { data: tasks, error: taskError } = await client.from('staff_onboarding_tasks').select('*').eq('package_id', packageRow.id).order('sort_order', { ascending: true });
    if (taskError) throw taskError;
    return NextResponse.json({ package: packageRow, tasks: tasks || [], actor: session.email });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.onboarding.tasks_load_failed', actor: session.email, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load onboarding package.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const nextStatus = typeof body?.status === 'string' ? body.status : '';
  if (!['pending', 'completed', 'waived'].includes(nextStatus)) return NextResponse.json({ error: 'Invalid onboarding task status.' }, { status: 400 });
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;
  try {
    const client = db();
    const { data: task, error: taskError } = await client.from('staff_onboarding_tasks').select('id,package_id,status,required,acknowledgement_required,acknowledged_at').eq('id', id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: 'Onboarding task not found.' }, { status: 404 });
    const now = new Date().toISOString();
    const { data: updatedTask, error: updateError } = await client.from('staff_onboarding_tasks').update({
      status: nextStatus,
      notes,
      completed_at: nextStatus === 'pending' ? null : now,
      completed_by: nextStatus === 'pending' ? null : session.email,
      updated_at: now,
    }).eq('id', id).select('*').single();
    if (updateError) throw updateError;

    const { data: packageOwner, error: packageOwnerError } = await client.from('staff_onboarding_packages').select('staff_id,title').eq('id', task.package_id).maybeSingle();
    if (packageOwnerError) throw packageOwnerError;
    const { data: tasks, error: taskListError } = await client.from('staff_onboarding_tasks').select('status,required,acknowledgement_required,acknowledged_at').eq('package_id', task.package_id);
    if (taskListError) throw taskListError;
    const onboardingStatus = calculateOnboardingStatus(tasks || []);
    const { data: updatedPackage, error: packageError } = await client.from('staff_onboarding_packages').update({ status: onboardingStatus, completed_at: onboardingStatus === 'complete' ? now : null, updated_at: now }).eq('id', task.package_id).select('*').single();
    if (packageError) throw packageError;
    if (packageOwner?.staff_id) {
      await createLauremStaffNotification(client, {
        staffId: packageOwner.staff_id,
        category: 'onboarding',
        title: `Onboarding task ${nextStatus}`,
        body: `Your onboarding task was marked ${nextStatus.replaceAll('_', ' ')}: ${updatedTask.title}.`,
        actionUrl: '/staff/onboarding',
      });
    }
    return NextResponse.json({ task: updatedTask, package: updatedPackage });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.onboarding.task_update_failed', actor: session.email, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to update onboarding task.' }, { status: 500 });
  }
}
