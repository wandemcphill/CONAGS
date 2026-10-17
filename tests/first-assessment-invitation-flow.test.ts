import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const statusRoute = readFileSync(
  resolve(process.cwd(), 'app/api/admin/applications/route.ts'),
  'utf8',
);
const interviewRoute = readFileSync(
  resolve(process.cwd(), 'app/api/admin/interviews/route.ts'),
  'utf8',
);
const candidateRoute = readFileSync(
  resolve(process.cwd(), 'app/api/interview/route.ts'),
  'utf8',
);

describe('first assessment invitation flow', () => {
  it('generates a private expiring link when the application enters Interview', () => {
    expect(statusRoute).toContain("if(status==='Interview')");
    expect(statusRoute).toContain('const token=makeToken()');
    expect(statusRoute).toContain('token_hash:hashToken(token)');
    expect(statusRoute).toContain("const link=`${appUrl()}/interview/${token}`");
    expect(statusRoute).toContain('link,expiresAt,questions:ROUND1_QUESTIONS_PER_ATTEMPT');
  });

  it('does not mark a newly issued assessment invitation as already used', () => {
    expect(statusRoute).toContain('expires_at:expiresAt,used_at:null');
    expect(interviewRoute).toContain('expires_at:assessmentExpiresAt,used_at:null');
  });

  it('keeps the candidate endpoint token-bound and server-side answer protected', () => {
    expect(candidateRoute).toContain("x-invitation-token");
    expect(candidateRoute).toContain('eq(\'token_hash\',hashToken(token))');
    expect(candidateRoute).toContain('publicQuestions');
    expect(candidateRoute).not.toContain('correctIndex:q.correctIndex}));\n    return NextResponse.json({attemptId');
  });
});
