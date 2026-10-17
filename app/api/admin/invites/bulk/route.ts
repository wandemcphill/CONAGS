import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { createAndSendLauremInvite } from '@/lib/laurem-recruitment-invites';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';

const MAX_INVITES = 25;

type Row = { candidateName: string; candidateEmail: string; role: string };

function parseRows(input: unknown): Row[] {
  if (typeof input !== 'string') return [];
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|,/).map((part) => part.trim());
    return { candidateName: parts[0] || '', candidateEmail: (parts[1] || '').toLowerCase(), role: parts.slice(2).join(',').trim() || 'Support Worker' };
  });
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 64000) return NextResponse.json({ error:'Request payload is too large.' }, { status:413 });
  let body: { rows?: unknown };
  try { body = JSON.parse(raw) as typeof body; } catch { return NextResponse.json({ error:'Invalid request.' }, { status:400 }); }
  const rows = parseRows(body.rows);
  if (!rows.length) return NextResponse.json({ error:'Provide at least one candidate row.' }, { status:400 });
  if (rows.length > MAX_INVITES) return NextResponse.json({ error:`A bulk invitation run is limited to ${MAX_INVITES} candidates.` }, { status:400 });

  const results: Array<Record<string, unknown>> = [];
  for (let index=0; index<rows.length; index += 1) {
    const row=rows[index];
    const role=normalizeLauremRole(row.role);
    if(!row.candidateName||!row.candidateEmail||!role){
      results.push({ row:index+1,candidateName:row.candidateName,email:row.candidateEmail,status:'rejected',error:'Name, email and a valid role are required.' });
      continue;
    }
    try{
      const result=await createAndSendLauremInvite({candidateName:row.candidateName,candidateEmail:row.candidateEmail,role},session.email);
      results.push({row:index+1,candidateName:row.candidateName,email:row.candidateEmail,role:result.role,status:'created',emailStatus:result.email.status,attempts:result.email.attempts});
    }catch(error){
      results.push({row:index+1,candidateName:row.candidateName,email:row.candidateEmail,status:'failed',error:error instanceof Error?error.message:'Unable to create invitation.'});
    }
  }

  const summary={total:results.length,created:results.filter((item)=>item.status==='created').length,rejected:results.filter((item)=>item.status==='rejected').length,failed:results.filter((item)=>item.status==='failed').length};
  return NextResponse.json({summary,results},{status:201});
}
