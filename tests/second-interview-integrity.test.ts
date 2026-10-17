import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS second interview submission integrity', () => {
  const route = readFileSync(resolve(process.cwd(), 'app/api/second-interview/route.ts'), 'utf8');

  it('bounds request body size before JSON parsing', () => {
    expect(route).toContain('const MAX_BODY=512_000;');
    expect(route).toContain("return NextResponse.json({error:'Interview payload is too large.'},{status:413})");
  });

  it('derives the universal second-stage pathway from the linked application and role', () => {
    expect(route).toContain("select('id,full_name,email,role_applied,living_in_uk,status')");
    expect(route).toContain("const role=normalizeLauremRole(application.role_applied||'');");
    expect(route).toContain("pathway:application.living_in_uk==='No'?'international':'uk'");
    expect(route).toContain('selectRound2Questions(role)');
  });

  it('binds the assessment attempt to the exact second-stage invitation', () => {
    expect(route).toContain("eq('second_interview_id',invite.id)");
    expect(route).toContain("second_interview_id:invite.id");
    expect(route).toContain("if(attempt.status==='submitted')return NextResponse.json({error:'This second-stage assessment has already been submitted.'},{status:409});");
    expect(route).toContain('laurem_complete_round2');
  });
});
