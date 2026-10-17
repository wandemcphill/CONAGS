import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const { data: packageRow, error: packageError } = await client
    .from('laurem_staff_onboarding_packages')
    .select('id,staff_id,audience,title,status,assigned_at,completed_at,created_at,updated_at')
    .eq('staff_id', session.staff_id)
    .maybeSingle();
  if (packageError) return NextResponse.json({ error: 'Unable to load onboarding package.' }, { status: 500 });
  if (!packageRow) return NextResponse.json({ package: null, tasks: [] });

  const { data: tasks, error: taskError } = await client
    .from('laurem_staff_onboarding_tasks')
    .select('id,package_id,task_key,category,title,description,required,status,document_path,acknowledgement_required,acknowledged_at,completed_at,notes,sort_order')
    .eq('package_id', packageRow.id)
    .order('sort_order', { ascending: true });
  if (taskError) return NextResponse.json({ error: 'Unable to load onboarding tasks.' }, { status: 500 });

  return NextResponse.json({ package: packageRow, tasks: tasks || [] });
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!taskId || action !== 'acknowledge') {
    return NextResponse.json({ error: 'A task id and acknowledge action are required.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const { data, error } = await db()
      .rpc('laurem_acknowledge_staff_onboarding_task', {
        p_staff_id: session.staff_id,
        p_task_id: taskId,
      })
      .abortSignal(controller.signal);

    if (error || !data) {
      const message = error?.message || '';
      const known: Record<string, { status: number; error: string }> = {
        STAFF_NOT_ELIGIBLE: { status: 403, error: 'Your Staff Portal account is not eligible for onboarding updates.' },
        ONBOARDING_PACKAGE_NOT_FOUND: { status: 404, error: 'Onboarding package not found.' },
        ONBOARDING_TASK_NOT_FOUND: { status: 404, error: 'Onboarding task not found.' },
        ACKNOWLEDGEMENT_NOT_REQUIRED: { status: 409, error: 'This onboarding task does not require employee acknowledgement.' },
        TASK_ALREADY_ACKNOWLEDGED: { status: 409, error: 'This task has already been acknowledged.' },
        TASK_ALREADY_COMPLETED: { status: 409, error: 'This onboarding task has already been completed or waived.' },
        ONBOARDING_PACKAGE_UPDATE_FAILED: { status: 409, error: 'Unable to update onboarding package state.' },
        ONBOARDING_TASK_UPDATE_FAILED: { status: 409, error: 'Unable to update onboarding task state.' },
      };
      const key = Object.keys(known).find((item) => message.includes(item));
      if (key) return NextResponse.json({ error: known[key].error }, { status: known[key].status });
      return NextResponse.json({ error: 'Unable to acknowledge onboarding task.' }, { status: 409 });
    }

    return NextResponse.json({
      task: data.task,
      package: data.package,
    });
  } catch {
    if (controller.signal.aborted) {
      return NextResponse.json({
        error: 'The acknowledgement request timed out. Refresh onboarding to check whether it was saved before retrying.',
      }, { status: 504 });
    }
    return NextResponse.json({ error: 'Unable to acknowledge onboarding task.' }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
