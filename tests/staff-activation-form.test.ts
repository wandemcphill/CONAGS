import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff activation form', () => {
  it('allows the candidate to enter the activation email while retaining token-bound server validation', () => {
    const form = readFileSync('app/staff/activate/ActivationForm.tsx', 'utf8');

    expect(form).toContain("const emailFromUrl = searchParams.get('email')?.trim().toLowerCase() || '';");
    expect(form).toContain('const [email, setEmail] = useState(emailFromUrl);');
    expect(form).toContain('type="email"');
    expect(form).toContain('onChange={(event) => setEmail(event.target.value.trimStart())}');
    expect(form).not.toContain('readOnly value={email}');
    expect(form).toContain('body: JSON.stringify({ token, email, password })');
    expect(form).toContain("fetch('/api/staff/auth/activate?token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(emailFromUrl)");
    expect(form).toContain('disabled={checking || busy || !token || !email.trim()}');
  });
});
