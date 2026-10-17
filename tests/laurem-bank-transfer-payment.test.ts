import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('CONAGS bank transfer invoice payment flow', () => {
  it('reads invoice bank details from the private server-side payment account', () => {
    const page = read('app/staff/visa-sponsorship/page.tsx');
    const route = read('app/api/staff/visa-sponsorship/route.ts');

    expect(page).toContain('paymentBankDetails');
    expect(page).toContain('bankDetails={data.paymentBankDetails}');
    expect(page).not.toContain('laurem-payment-details');
    expect(page).not.toContain('WEBGEEK TECHNOLOGIES LTD');
    expect(route).toContain("laurem_payment_accounts");
    expect(route).toContain("eq('account_key','primary_gbp')");
    expect(route).toContain("eq('is_active',true)");
  });

  it('keeps CONAGS ID as the generated payment reference', () => {
    const migration = read('supabase/migrations/20261007213000_laurem_bank_transfer_payment_details.sql');

    expect(migration).toContain('payment_reference');
    expect(migration).toContain('v_staff.laurem_id');
    expect(migration).toContain('STAFF_LAUREM_ID_MISSING');
    expect(migration).toContain('payment_url = null');
    expect(migration).not.toContain('payssion.com');
    expect(migration).not.toContain('buy.stripe.com');
  });
});
