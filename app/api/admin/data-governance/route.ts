import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';

async function scan(client: ReturnType<typeof db>) {
  const { data, error } = await client.rpc('laurem_data_governance_scan');
  if (error) throw error;
  return data;
}

async function metadataManifest(client: ReturnType<typeof db>, subjectType: 'application' | 'staff', id: string) {
  if (subjectType === 'application') {
    const [{ data: application }, { data: documents }, { data: contracts }, { count: auditCount }] = await Promise.all([
      client.from('recruitment_applications').select('id,full_name,role_applied,status,country_of_residence,living_in_uk,created_at,updated_at').eq('id', id).maybeSingle(),
      client.from('recruitment_documents').select('id,document_type,status,original_filename,mime_type,file_size_bytes,uploaded_at,reviewed_at').eq('application_id', id).order('uploaded_at', { ascending: false }),
      client.from('recruitment_contracts').select('id,version,job_title,status,issued_at,viewed_at,accepted_at,declined_at,created_at').eq('application_id', id).order('version', { ascending: false }),
      client.from('laurem_audit_events').select('id', { count: 'exact', head: true }).eq('application_id', id),
    ]);
    return {
      subjectType,
      subjectId: id,
      generatedAt: new Date().toISOString(),
      scope: 'metadata-only',
      application,
      documents: documents || [],
      contracts: contracts || [],
      auditEventCount: auditCount || 0,
    };
  }

  const [{ data: staff }, { data: documents }, { data: visaCases }, { count: auditCount }] = await Promise.all([
    client.from('staff_profiles').select('id,laurem_id,employee_number,full_name,email,job_title,employment_status,start_date,end_date,location,created_at,updated_at').eq('id', id).maybeSingle(),
    client.from('staff_documents').select('id,category,title,original_filename,mime_type,file_size_bytes,status,signature_status,issued_at,first_viewed_at,last_viewed_at,created_at,updated_at').eq('staff_id', id).order('issued_at', { ascending: false }),
    client.from('staff_visa_cases').select('id,pathway,status,requested_at,submitted_at,cos_assigned_at,completed_at,created_at,updated_at').eq('staff_id', id).order('created_at', { ascending: false }),
    client.from('laurem_audit_events').select('id', { count: 'exact', head: true }).eq('staff_id', id),
  ]);

  return {
    subjectType,
    subjectId: id,
    generatedAt: new Date().toISOString(),
    scope: 'metadata-only',
    staff,
    documents: documents || [],
    visaCases: visaCases || [],
    auditEventCount: auditCount || 0,
  };
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const scanResult = await scan(client);

    const [{ data: policies }, { data: findings }, { data: requests }] = await Promise.all([
      client.from('laurem_data_governance_policies').select('*').order('area').order('title'),
      client.from('laurem_data_governance_findings').select('*').order('status').order('severity').order('last_detected_at', { ascending: false }).limit(500),
      client.from('laurem_data_access_requests').select('*').order('requested_at', { ascending: false }).limit(200),
    ]);

    return NextResponse.json({
      policies: policies || [],
      findings: findings || [],
      requests: requests || [],
      scan: scanResult,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.data_governance.load_failed', actor:session.email, reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error:'Unable to load data governance controls.' }, { status:500 });
  }
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    requestType?: string;
    subjectType?: string;
    subjectId?: string;
    reason?: string;
  } | null;

  const requestType = body?.requestType;
  const subjectType = body?.subjectType;
  const subjectId = typeof body?.subjectId === 'string' ? body.subjectId.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';

  if (!['export','deletion_review'].includes(requestType || '')) return NextResponse.json({ error:'Invalid request type.' }, { status:400 });
  if (!['application','staff'].includes(subjectType || '')) return NextResponse.json({ error:'Invalid subject type.' }, { status:400 });
  if (!subjectId) return NextResponse.json({ error:'Subject id is required.' }, { status:400 });
  if (!reason) return NextResponse.json({ error:'A reason is required for data access requests.' }, { status:400 });

  try {
    const client = db();

    const table = subjectType === 'application' ? 'recruitment_applications' : 'staff_profiles';
    const { data: subject, error: subjectError } = await client.from(table).select('id').eq('id', subjectId).maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject) return NextResponse.json({ error:'Subject record not found.' }, { status:404 });

    const { data, error } = await client.from('laurem_data_access_requests').insert({
      request_type: requestType,
      subject_type: subjectType,
      application_id: subjectType === 'application' ? subjectId : null,
      staff_id: subjectType === 'staff' ? subjectId : null,
      requested_by: session.email,
      reason,
    }).select('*').single();

    if (error || !data) throw error || new Error('Unable to create data governance request.');

    await client.rpc('laurem_record_audit_event', {
      p_lifecycle_area:'governance',
      p_entity_type:'data_access_request',
      p_entity_id:data.id,
      p_application_id:data.application_id,
      p_staff_id:data.staff_id,
      p_actor_type:'admin',
      p_actor:session.email,
      p_action:`data_request.${requestType}.created`,
      p_previous_state:null,
      p_new_state:'requested',
      p_reason:reason,
      p_source_table:'laurem_data_access_requests',
      p_source_event_id:data.id,
      p_metadata:{scope:'metadata-only',requestType},
    });

    return NextResponse.json({ request:data }, { status:201 });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.data_governance.request_failed', actor:session.email, reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error:'Unable to create the data governance request.' }, { status:500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });

  const body = await request.json().catch(() => null) as { kind?:string; id?:string; status?:string; reason?:string } | null;
  const kind = body?.kind;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const status = body?.status;
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0,2000) : '';

  if (!id || !['finding','request'].includes(kind || '')) return NextResponse.json({ error:'A valid governance item is required.' }, { status:400 });
  if (!reason) return NextResponse.json({ error:'A reason is required for governance state changes.' }, { status:400 });

  try {
    const client = db();

    if (kind === 'finding') {
      if (!['open','acknowledged','held','resolved'].includes(status || '')) return NextResponse.json({ error:'Invalid finding status.' }, { status:400 });
      const { data: current, error } = await client.from('laurem_data_governance_findings').select('*').eq('id',id).maybeSingle();
      if (error) throw error;
      if (!current) return NextResponse.json({ error:'Finding not found.' }, { status:404 });

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status, updated_at:now };
      if (status === 'resolved') { patch.resolved_by = session.email; patch.resolved_at = now; patch.resolution_note = reason; }
      if (status === 'open') { patch.resolved_by = null; patch.resolved_at = null; patch.resolution_note = null; }

      const { data: updated, error: updateError } = await client.from('laurem_data_governance_findings').update(patch).eq('id',id).select('*').single();
      if (updateError || !updated) throw updateError || new Error('Unable to update finding.');

      await client.from('laurem_data_governance_events').insert({ finding_id:id,event_type:status === 'open' ? 'reopened' : status,actor:session.email,reason });
      await client.rpc('laurem_record_audit_event', {
        p_lifecycle_area:'governance',
        p_entity_type:'data_governance_finding',
        p_entity_id:id,
        p_application_id:updated.application_id,
        p_staff_id:updated.staff_id,
        p_actor_type:'admin',
        p_actor:session.email,
        p_action:`governance.finding.${status}`,
        p_previous_state:current.status,
        p_new_state:status,
        p_reason:reason,
        p_source_table:'laurem_data_governance_findings',
        p_source_event_id:id,
        p_metadata:{findingType:updated.finding_type,subjectType:updated.subject_type},
      });

      return NextResponse.json({ finding:updated });
    }

    if (!['requested','approved','on_hold','completed','rejected'].includes(status || '')) return NextResponse.json({ error:'Invalid request status.' }, { status:400 });
    const { data: current, error } = await client.from('laurem_data_access_requests').select('*').eq('id',id).maybeSingle();
    if (error) throw error;
    if (!current) return NextResponse.json({ error:'Data request not found.' }, { status:404 });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status, reviewed_by: ['approved','on_hold','rejected'].includes(status || '') ? session.email : current.reviewed_by, reviewed_at: ['approved','on_hold','rejected'].includes(status || '') ? now : current.reviewed_at, updated_at: now, resolution_note: reason };

    if (status === 'approved' && current.request_type === 'export') {
      patch.manifest = await metadataManifest(client,current.subject_type,current.subject_type === 'application' ? current.application_id : current.staff_id);
    }

    if (status === 'completed') patch.completed_at = now;

    const { data: updated, error: updateError } = await client.from('laurem_data_access_requests').update(patch).eq('id',id).select('*').single();
    if (updateError || !updated) throw updateError || new Error('Unable to update data request.');

    await client.rpc('laurem_record_audit_event', {
      p_lifecycle_area:'governance',
      p_entity_type:'data_access_request',
      p_entity_id:id,
      p_application_id:updated.application_id,
      p_staff_id:updated.staff_id,
      p_actor_type:'admin',
      p_actor:session.email,
      p_action:`data_request.${updated.request_type}.${status}`,
      p_previous_state:current.status,
      p_new_state:status,
      p_reason:reason,
      p_source_table:'laurem_data_access_requests',
      p_source_event_id:id,
      p_metadata:{manifestScope:updated.manifest?.scope || null},
    });

    return NextResponse.json({ request:updated });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.data_governance.update_failed', actor:session.email, itemId:id, reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error:'Unable to update governance state.' }, { status:500 });
  }
}
